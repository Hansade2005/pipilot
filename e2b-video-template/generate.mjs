// ────────────────────────────────────────────────────────────────────────
// generate.mjs — storyboard-driven video generator (pipilot-video engine).
//
//   node generate.mjs storyboard.json                 → out/video.mp4
//   PIXABAY_KEY=<key> node generate.mjs storyboard.json   (for `video` scenes)
//
// Consumes a VALIDATED storyboard (see storyboard.mjs) and resolves assets from
// the baked local corpus via stockdb.mjs (music by mood, stills by keyword/pack/
// color — zero API), Pixabay live for `video` b-roll, Playwright for title/
// credits cards AND `screencast` (drives the live app), ffmpeg to stitch.
//
// Runs in the pipilot-video E2B template: ffmpeg + chromium + /opt/stockdb baked.
// ────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pickMusic, pickPhotos } from './stockdb.mjs'
import { validateStoryboard, resolveCanvas } from './storyboard.mjs'

// Pin the baked Chromium location. E2B's SDK command execution doesn't reliably
// inherit the image's Docker ENV, so relying on PLAYWRIGHT_BROWSERS_PATH being
// present at runtime fails (Playwright falls back to ~/.cache/ms-playwright and
// finds nothing). Playwright reads this env at launch(), not import, so setting
// it here — before any getBrowser() — takes effect. Matches the Dockerfile path.
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/ms-playwright'

// ── load + validate the storyboard ──────────────────────────────────────────
const sbPath = process.argv[2]
const SB = sbPath ? JSON.parse(fs.readFileSync(sbPath, 'utf8')) : JSON.parse(process.env.STORYBOARD_JSON || '{}')
const check = validateStoryboard(SB)
if (!check.ok) { console.error('Invalid storyboard:\n' + check.errors.join('\n')); process.exit(2) }

const { width: W, height: H, fps: FPS } = resolveCanvas(SB)
const XF = 0.6 // crossfade seconds
const KEY = process.env.PIXABAY_KEY
const needsPixabay = SB.scenes.some((s) => s.kind === 'video')
if (needsPixabay && !KEY) { console.error('This storyboard has `video` scenes — set PIXABAY_KEY (connect Pixabay).'); process.exit(2) }

const CACHE = path.join(import.meta.dirname, '.cache')
const WORK = path.join(import.meta.dirname, '.work')
const OUT = path.join(import.meta.dirname, 'out')
for (const d of [CACHE, WORK, OUT]) fs.mkdirSync(d, { recursive: true })

const t0 = process.hrtime.bigint()
const secs = () => Number(process.hrtime.bigint() - t0) / 1e9
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) }

// ── ffmpeg + curl helpers ───────────────────────────────────────────────────
const ff = (a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: ['ignore', 'ignore', 'inherit'] })
function curl(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest
  try { execFileSync('curl', ['-f', '-sS', '-L', '--max-time', '120', '-o', dest, url], { stdio: ['ignore', 'ignore', 'inherit'] }) }
  catch (e) { try { fs.unlinkSync(dest) } catch {} throw e }
  return dest
}

// Pixabay `video` b-roll (live API — the ONE thing that needs the user's key).
function pixabayVideo(q) {
  const cf = path.join(CACHE, `pxv_${hash(q)}.json`)
  if (!fs.existsSync(cf)) {
    const p = new URLSearchParams({ key: KEY, q, safesearch: 'true', per_page: '30', order: 'popular' })
    curl(`https://pixabay.com/api/videos/?${p}`, cf)
  }
  const hits = JSON.parse(fs.readFileSync(cf, 'utf8')).hits || []
  if (!hits.length) throw new Error(`No Pixabay video for "${q}"`)
  return hits
}

// ── segment builders — every segment exits in the SAME format (critical) ─────
const NORM = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1,format=yuv420p`
const SEG = ['-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast']

function brollSeg(out, url, dur, start = 0) {
  const src = curl(url, path.join(CACHE, `vid_${hash(url)}.mp4`))
  ff(['-ss', `${start}`, '-t', `${dur}`, '-i', src, '-an', '-vf', NORM, ...SEG, out])
}
function kenBurnsSeg(out, url, dur, forward = true) {
  const src = curl(url, path.join(CACHE, `img_${hash(url)}.jpg`))
  const cw = Math.round((W * 1.2) / 2) * 2, ch = Math.round((H * 1.2) / 2) * 2
  const p = forward ? `(t/${dur})` : `(1-(t/${dur}))`
  const vf = `scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch},` +
    `crop=${W}:${H}:x='(in_w-out_w)*${p}':y='(in_h-out_h)*${p}',fps=${FPS},setsar=1,format=yuv420p`
  ff(['-loop', '1', '-t', `${dur}`, '-i', src, '-an', '-vf', vf, ...SEG, out])
}

// One shared browser for ALL cards + screencasts (launching per item costs ~4.5s).
// Playwright is imported dynamically (not a hoisted static import) so the
// PLAYWRIGHT_BROWSERS_PATH override set at module top is in effect before the
// package resolves its browser registry — a static import would evaluate first.
let _browser = null
const getBrowser = async () => (_browser ??= await (await import('playwright')).chromium.launch())

async function cardSeg(out, dur, html) {
  const vdir = fs.mkdtempSync(path.join(WORK, 'card-'))
  try {
    const ctx = await (await getBrowser()).newContext({ viewport: { width: W, height: H }, recordVideo: { dir: vdir, size: { width: W, height: H } } })
    const page = await ctx.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    await page.waitForTimeout(Math.round(dur * 1000))
    await page.close(); await ctx.close()
    const webm = fs.readdirSync(vdir).find((f) => f.endsWith('.webm'))
    if (!webm) throw new Error('no .webm recorded')
    ff(['-t', `${dur}`, '-i', path.join(vdir, webm), '-an', '-vf', NORM, ...SEG, out])
  } finally { fs.rmSync(vdir, { recursive: true, force: true }) }
}

// NEW: screencast — drive the user's LIVE app and record it as footage, with a
// synthetic cursor overlay + click ripples so it reads as a produced demo.
async function screencastSeg(out, url, steps, maxDur = 20) {
  const vdir = fs.mkdtempSync(path.join(WORK, 'cast-'))
  try {
    const ctx = await (await getBrowser()).newContext({ viewport: { width: W, height: H }, recordVideo: { dir: vdir, size: { width: W, height: H } } })
    const page = await ctx.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await installCursor(page)
    const deadline = Date.now() + maxDur * 1000
    for (const st of steps) {
      if (Date.now() > deadline) break
      await runStep(page, st, url).catch(() => {})
    }
    await page.waitForTimeout(500)
    await page.close(); await ctx.close()
    const webm = fs.readdirSync(vdir).find((f) => f.endsWith('.webm'))
    if (!webm) throw new Error('no screencast recorded')
    // Cap to maxDur; natural length otherwise (screencasts are action-length).
    ff(['-t', `${maxDur}`, '-i', path.join(vdir, webm), '-an', '-vf', NORM, ...SEG, out])
  } finally { fs.rmSync(vdir, { recursive: true, force: true }) }
}
// A CSS cursor dot + click ripple injected into the page so interactions are visible.
async function installCursor(page) {
  await page.addStyleTag({ content: `#__ppcur{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(0,0,0,.55);box-shadow:0 0 0 2px #fff,0 2px 8px rgba(0,0,0,.4);pointer-events:none;transition:left .5s cubic-bezier(.4,0,.2,1),top .5s cubic-bezier(.4,0,.2,1);left:50%;top:50%}
    @keyframes __pprip{from{opacity:.5;transform:scale(0)}to{opacity:0;transform:scale(2.4)}}
    .__pprip{position:fixed;z-index:2147483646;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:var(--signal,#f59e0b);pointer-events:none;animation:__pprip .5s ease-out forwards}` }).catch(() => {})
  await page.evaluate(() => { const d = document.createElement('div'); d.id = '__ppcur'; document.body.appendChild(d) }).catch(() => {})
}
async function moveCursorTo(page, sel) {
  const box = await page.locator(sel).first().boundingBox().catch(() => null)
  if (!box) return null
  const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2)
  await page.evaluate(([x, y]) => { const c = document.getElementById('__ppcur'); if (c) { c.style.left = x + 'px'; c.style.top = y + 'px' } }, [x, y])
  await page.mouse.move(x, y)
  await page.waitForTimeout(550)
  return { x, y }
}
async function ripple(page, x, y) {
  await page.evaluate(([x, y]) => { const r = document.createElement('div'); r.className = '__pprip'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 600) }, [x, y]).catch(() => {})
}
// Map a storyboard step → Playwright. `selector` is a CSS selector; `ref` is
// accepted as a CSS selector fallback or a text= match (so the agent can pass
// either a selector it read from the DOM or a visible label).
function targetOf(st) { return st.selector || (st.ref?.startsWith('text=') ? st.ref : st.ref ? st.ref : null) }
async function runStep(page, st, baseUrl) {
  const sel = targetOf(st)
  if (st.action === 'goto') { const u = new URL(st.path, baseUrl).href; await page.goto(u, { waitUntil: 'domcontentloaded' }); await installCursor(page); return }
  if (st.action === 'wait') { await page.waitForTimeout(Math.min(st.ms, 5000)); return }
  if (st.action === 'press') { await page.keyboard.press(st.key); return }
  if (!sel) return
  const pos = await moveCursorTo(page, sel)
  if (st.action === 'hover') { return }
  if (st.action === 'scrollTo') { await page.locator(sel).first().scrollIntoViewIfNeeded().catch(() => {}); return }
  if (st.action === 'click') { if (pos) await ripple(page, pos.x, pos.y); await page.locator(sel).first().click({ timeout: 4000 }).catch(() => {}); return }
  if (st.action === 'type') {
    if (pos) await ripple(page, pos.x, pos.y)
    await page.locator(sel).first().click({ timeout: 4000 }).catch(() => {})
    for (const ch of String(st.text)) { await page.keyboard.type(ch); await page.waitForTimeout(st.slowmo || 45) }
  }
}

// ── HTML cards (themeable branding) ──────────────────────────────────────────
// Cards are unique PER VIDEO: the storyboard's `theme` (and per-scene overrides)
// pick a style PRESET + colors + fonts. Chromium has network in the sandbox, so
// `font` can be a Google Fonts family (loaded via <link>) for real custom type;
// known keywords (sans/serif/mono) use the baked system fonts as a safe default.
const esc = (v) => String(v == null ? '' : v).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))
const DEFAULT_THEME = { bg: '#0E1726', bg2: '#12324a', accent: '#00C2A8', text: '#ffffff', sub: '#9fb2c4', style: 'spotlight', font: 'sans' }
function resolveTheme(scene) {
  return { ...DEFAULT_THEME, ...(SB.theme || {}), ...(scene?.style && typeof scene.style === 'object' ? scene.style : {}), ...(typeof scene?.style === 'string' ? { style: scene.style } : {}) }
}
function fontFor(font) {
  const keys = { sans: `'Liberation Sans','DejaVu Sans',Arial,sans-serif`, serif: `'Liberation Serif','Noto Serif',Georgia,serif`, mono: `'Liberation Mono','DejaVu Sans Mono',monospace` }
  if (!font || keys[font]) return { face: keys[font] || keys.sans, link: '' }
  const fam = String(font).trim().replace(/[^\w \-]/g, '')
  return { face: `'${fam}','Liberation Sans',Arial,sans-serif`, link: `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${fam.replace(/\s+/g, '+')}:wght@400;600;700;800&display=swap">` }
}
function bgFor(t) {
  if (Array.isArray(t.bg)) return `linear-gradient(135deg, ${t.bg.map(esc).join(', ')})`
  if (typeof t.bg === 'string' && /gradient\(/.test(t.bg)) return t.bg
  const base = t.bg || '#0E1726'
  return `radial-gradient(120% 120% at 20% 10%, ${esc(t.bg2 || base)} 0%, ${esc(base)} 62%, ${esc(base)} 100%)`
}
// Style presets — distinct layouts/typography/motion. Each gets resolved colors + font face.
const STYLES = {
  spotlight: (t, s, c) => `<div class="bg" style="position:fixed;inset:0;background:${c.bg}"></div>
    <div class="w" style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:${c.face}">
      <div style="width:64px;height:5px;border-radius:3px;background:${c.accent};transform:scaleX(0);animation:g .8s .1s forwards cubic-bezier(.2,.8,.2,1)"></div>
      <h1 style="margin:0;color:${c.text};font-size:88px;font-weight:800;letter-spacing:-2px;opacity:0;transform:translateY(24px);animation:r .9s .25s forwards cubic-bezier(.2,.8,.2,1);text-align:center;padding:0 6%">${esc(t)}</h1>
      ${s ? `<p style="margin:0;color:${c.sub};font-size:26px;font-weight:500;opacity:0;animation:f 1s .7s forwards">${esc(s)}</p>` : ''}</div>`,
  bold: (t, s, c) => `<div style="position:fixed;inset:0;background:${c.bg}"></div>
    <div style="position:fixed;inset:0;display:flex;flex-direction:column;justify-content:center;gap:18px;padding:0 9%;font-family:${c.face}">
      <div style="width:120px;height:14px;background:${c.accent};opacity:0;transform:translateX(-30px);animation:r .7s .1s forwards cubic-bezier(.2,.8,.2,1)"></div>
      <h1 style="margin:0;color:${c.text};font-size:104px;font-weight:800;line-height:.98;letter-spacing:-3px;opacity:0;transform:translateY(28px);animation:r .9s .25s forwards cubic-bezier(.2,.8,.2,1)">${esc(t)}</h1>
      ${s ? `<p style="margin:0;color:${c.sub};font-size:30px;font-weight:600;opacity:0;animation:f 1s .7s forwards">${esc(s)}</p>` : ''}</div>`,
  gradient: (t, s, c) => `<div style="position:fixed;inset:0;background:${Array.isArray(SB.theme?.bg) || /gradient\(/.test(String(SB.theme?.bg||'')) ? c.bg : `linear-gradient(135deg, ${c.accent} 0%, ${c.bgSolid} 100%)`}"></div>
    <div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;font-family:${c.face}">
      <h1 style="margin:0;color:${c.text};font-size:92px;font-weight:800;letter-spacing:-2px;text-align:center;padding:0 7%;opacity:0;transform:scale(.94);animation:r .9s .2s forwards cubic-bezier(.2,.8,.2,1)">${esc(t)}</h1>
      ${s ? `<p style="margin:0;padding:10px 24px;border-radius:99px;background:rgba(255,255,255,.14);backdrop-filter:blur(6px);color:${c.text};font-size:24px;font-weight:600;opacity:0;animation:f 1s .7s forwards">${esc(s)}</p>` : ''}</div>`,
  minimal: (t, s, c) => `<div style="position:fixed;inset:0;background:${c.bgSolid}"></div>
    <div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:${c.face}">
      <div style="width:10px;height:10px;border-radius:99px;background:${c.accent};opacity:0;transform:scale(0);animation:r .6s .1s forwards cubic-bezier(.2,.8,.2,1)"></div>
      <h1 style="margin:0;color:${c.text};font-size:76px;font-weight:600;letter-spacing:-1px;text-align:center;padding:0 8%;opacity:0;transform:translateY(16px);animation:r .9s .3s forwards cubic-bezier(.2,.8,.2,1)">${esc(t)}</h1>
      ${s ? `<p style="margin:0;color:${c.sub};font-size:22px;font-weight:400;letter-spacing:.5px;opacity:0;animation:f 1s .7s forwards">${esc(s)}</p>` : ''}</div>`,
  editorial: (t, s, c) => `<div style="position:fixed;inset:0;background:${c.bgSolid}"></div>
    <div style="position:fixed;inset:0;display:flex;flex-direction:column;justify-content:center;gap:22px;padding:0 10%;font-family:${c.face}">
      <div style="height:3px;background:${c.accent};transform:scaleX(0);transform-origin:left;animation:g .8s .1s forwards cubic-bezier(.2,.8,.2,1)"></div>
      <h1 style="margin:0;color:${c.text};font-size:88px;font-weight:700;line-height:1.02;letter-spacing:-1.5px;opacity:0;transform:translateY(20px);animation:r .9s .3s forwards cubic-bezier(.2,.8,.2,1)">${esc(t)}</h1>
      ${s ? `<p style="margin:0;color:${c.sub};font-size:26px;font-weight:500;opacity:0;animation:f 1s .7s forwards">${esc(s)}</p>` : ''}
      <div style="height:3px;background:${c.accent};opacity:.5;transform:scaleX(0);transform-origin:left;animation:g .8s .5s forwards cubic-bezier(.2,.8,.2,1)"></div></div>`,
}
const KF = `@keyframes g{to{transform:scaleX(1)}}@keyframes r{to{opacity:1;transform:none}}@keyframes f{to{opacity:1}}`
function titleCard(scene) {
  const t = resolveTheme(scene)
  const c = { ...t, ...fontFor(t.font), bg: bgFor(t), bgSolid: Array.isArray(t.bg) ? t.bg[0] : (typeof t.bg === 'string' && !/gradient\(/.test(t.bg) ? t.bg : '#0E1726') }
  const render = STYLES[t.style] || STYLES.spotlight
  return `${c.link}<style>html,body{margin:0;height:100%;overflow:hidden}${KF}</style>${render(scene.title, scene.sub, c)}`
}
function creditsCard(lines, scene) {
  const t = resolveTheme(scene)
  const c = { ...t, ...fontFor(t.font), bgSolid: Array.isArray(t.bg) ? t.bg[0] : (typeof t.bg === 'string' && !/gradient\(/.test(t.bg) ? t.bg : '#0E1726') }
  return `${c.link}<style>html,body{margin:0;height:100%;background:${c.bgSolid};overflow:hidden}
 .w{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-family:${c.face};opacity:0;animation:f .8s .1s forwards}
 .t{color:${c.accent};font-size:22px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px}
 .l{color:${c.sub};font-size:20px}@keyframes f{to{opacity:1}}</style>
 <div class="w"><div class="t">Credits</div>${lines.map((l) => `<div class="l">${esc(l)}</div>`).join('')}</div>`
}

// ── assemble ────────────────────────────────────────────────────────────────
function xfadeConcat(out, segs, durs) {
  const trans = ['fade', 'slideleft', 'fade', 'slideup', 'fade']
  let filter = '', prev = '[0:v]', acc = durs[0]
  for (let i = 1; i < segs.length; i++) {
    const label = i === segs.length - 1 ? '[v]' : `[x${i}]`
    filter += `${prev}[${i}:v]xfade=transition=${trans[(i - 1) % trans.length]}:duration=${XF}:offset=${(acc - XF).toFixed(3)}${label};`
    acc += durs[i] - XF; prev = label
  }
  ff([...segs.flatMap((s) => ['-i', s]), '-filter_complex', filter.replace(/;$/, ''),
      '-map', '[v]', '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', out])
  return acc
}
const finalPreset = (t) => (t <= 60 ? 'veryslow' : t <= 180 ? 'slow' : 'medium')

// ── run ─────────────────────────────────────────────────────────────────────
;(async () => {
  console.log(`▶  ${W}x${H}@${FPS} · ${SB.scenes.length} scenes\n`)
  const credits = [], segs = [], durs = []
  // Resolve music up front — the credits card needs its attribution string.
  let musicUrl = null, musicCredit = null
  if (SB.music?.url) { musicUrl = SB.music.url; musicCredit = SB.music.credit || 'music' }
  else if (SB.music?.mood) { const m = pickMusic({ mood: SB.music.mood }); musicUrl = m.url; musicCredit = m.credit }
  try {
    for (let i = 0; i < SB.scenes.length; i++) {
      const s = SB.scenes[i]
      const out = path.join(WORK, `seg_${String(i).padStart(2, '0')}.mp4`)
      const dur = s.dur || 6
      if (s.kind === 'title') {
        await cardSeg(out, dur, titleCard(s))
      } else if (s.kind === 'video') {
        const h = pixabayVideo(s.q)[(s.pick || 0) % 30]
        credits.push(`${h.user} / Pixabay`)
        brollSeg(out, (h.videos.medium || h.videos.small || h.videos.tiny).url, dur, s.start || 0)
      } else if (s.kind === 'still') {
        const src = s.id ? { id: s.id } : s.topic ? { topic: s.topic } : s.collection ? { collection: s.collection } : { keyword: s.keyword }
        const [photo] = pickPhotos({ ...src, color: s.color, orientation: s.orientation, n: 1, seed: (s.pick || 0) + i })
        if (!photo?.url) throw new Error(`no photo resolved for scene ${i}`)
        credits.push(photo.credit)
        kenBurnsSeg(out, photo.url, dur, s.forward !== false)
      } else if (s.kind === 'screencast') {
        await screencastSeg(out, s.url, s.steps, s.dur || 12)
      } else { // credits (only rendered when the storyboard explicitly includes a credits scene)
        await cardSeg(out, dur, creditsCard([...new Set([...credits, musicCredit].filter(Boolean))], s))
      }
      segs.push(out); durs.push(dur)
      console.log(`  · seg ${i} (${s.kind}) — ${secs().toFixed(1)}s`)
    }
  } finally { if (_browser) await _browser.close() }

  const silent = path.join(WORK, 'silent.mp4')
  const total = xfadeConcat(silent, segs, durs)

  const finalOut = path.join(OUT, 'video.mp4')
  if (musicUrl) {
    const music = curl(musicUrl, path.join(CACHE, `music_${hash(musicUrl)}.mp3`))
    const fIn = Math.min(1.5, total), fOutStart = Math.max(0, total - 2), fOutDur = Math.min(2, total - fOutStart)
    ff(['-i', silent, '-i', music, '-filter_complex',
        `[1:a]atrim=0:${total.toFixed(2)},afade=t=in:st=0:d=${fIn.toFixed(2)},afade=t=out:st=${fOutStart.toFixed(2)}:d=${fOutDur.toFixed(2)},volume=0.85[a]`,
        '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-crf', '30', '-preset', finalPreset(total),
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k', '-shortest', finalOut])
  } else {
    ff(['-i', silent, '-c:v', 'libx264', '-crf', '30', '-preset', finalPreset(total), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', finalOut])
  }

  // Thumbnail: grab a crisp frame from the opening (into the animated title card
  // if there is one → an on-brand poster). out/thumb.jpg, read back by the app.
  try {
    const thumbOut = path.join(OUT, 'thumb.jpg')
    const at = Math.min(1.4, Math.max(0.3, total * 0.12))
    ff(['-ss', at.toFixed(2), '-i', finalOut, '-frames:v', '1', '-q:v', '3', '-vf', `scale=${W}:${H}`, thumbOut])
    if (fs.existsSync(thumbOut)) console.log(`   thumb: ${path.relative(process.cwd(), thumbOut)}`)
  } catch (e) { console.log(`   (thumb skipped: ${e.message})`) }

  const mb = (fs.statSync(finalOut).size / 1048576).toFixed(2)
  console.log(`\n✅ ${path.relative(process.cwd(), finalOut)} · ${total.toFixed(1)}s · ${mb} MB`)
  console.log(`   sources: ${[...new Set([...credits, musicCredit].filter(Boolean))].join(' · ')}`)
  console.log(`⏱  ${secs().toFixed(1)}s`)
})()
