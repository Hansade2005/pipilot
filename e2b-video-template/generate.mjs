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
import { chromium } from 'playwright'
import { pickMusic, pickPhotos } from './stockdb.mjs'
import { validateStoryboard, resolveCanvas } from './storyboard.mjs'

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
let _browser = null
const getBrowser = async () => (_browser ??= await chromium.launch())

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

// ── HTML cards (branding) ────────────────────────────────────────────────────
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif`
const titleCard = (t, s) => `<style>html,body{margin:0;height:100%;overflow:hidden}
 .bg{position:fixed;inset:0;background:radial-gradient(120% 120% at 20% 10%,#12324a 0%,#0E1726 55%,#080d16 100%)}
 .w{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:${FONT}}
 .k{width:64px;height:5px;border-radius:3px;background:#00C2A8;transform:scaleX(0);animation:g .8s .1s forwards cubic-bezier(.2,.8,.2,1)}
 h1{margin:0;color:#fff;font-size:88px;font-weight:800;letter-spacing:-2px;opacity:0;transform:translateY(24px);animation:r .9s .25s forwards cubic-bezier(.2,.8,.2,1);text-align:center;padding:0 6%}
 p{margin:0;color:#9fb2c4;font-size:26px;font-weight:500;opacity:0;animation:f 1s .7s forwards}
 @keyframes g{to{transform:scaleX(1)}}@keyframes r{to{opacity:1;transform:none}}@keyframes f{to{opacity:1}}</style>
 <div class="bg"></div><div class="w"><div class="k"></div><h1>${t}</h1>${s ? `<p>${s}</p>` : ''}</div>`
const creditsCard = (lines) => `<style>html,body{margin:0;height:100%;background:#0E1726;overflow:hidden}
 .w{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-family:${FONT};opacity:0;animation:f .8s .1s forwards}
 .t{color:#00C2A8;font-size:22px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px}
 .l{color:#c7d3df;font-size:20px}@keyframes f{to{opacity:1}}</style>
 <div class="w"><div class="t">Credits</div>${lines.map((l) => `<div class="l">${l}</div>`).join('')}</div>`

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
        await cardSeg(out, dur, titleCard(s.title, s.sub))
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
      } else { // credits
        await cardSeg(out, dur, creditsCard([...new Set([...credits, musicCredit].filter(Boolean))]))
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

  const mb = (fs.statSync(finalOut).size / 1048576).toFixed(2)
  console.log(`\n✅ ${path.relative(process.cwd(), finalOut)} · ${total.toFixed(1)}s · ${mb} MB`)
  console.log(`   sources: ${[...new Set([...credits, musicCredit].filter(Boolean))].join(' · ')}`)
  console.log(`⏱  ${secs().toFixed(1)}s`)
})()
