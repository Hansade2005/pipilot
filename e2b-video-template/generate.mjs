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
// DRAFT=1 → fast, low-res preview (ultrafast encode, downscaled, skip Google fonts).
const DRAFT = process.env.DRAFT === '1' || process.env.DRAFT === 'true'
// WATERMARK set (a label, or '1' for the default) → burn a corner watermark on the
// final video (free tier). SERVER sets this from the user's plan; the engine just honors it.
const WM = process.env.WATERMARK
const WM_TEXT = WM && WM !== '1' && WM !== 'true' ? String(WM).slice(0, 40) : 'Made with PiPilot'
const PIPER_DIR = process.env.PIPER_DIR || '/opt/piper'
const DEFAULT_VOICE = 'amy'
const CAPTIONS = SB.captions === true || SB.captions === 'true'
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
// ── Piper TTS (narration) ────────────────────────────────────────────────────
// Resolve a voice name → the baked .onnx model, falling back to the default (or
// any available voice) so a bad/unknown name never breaks the render.
function voiceModel(name) {
  const dir = path.join(PIPER_DIR, 'voices')
  const tryNames = [name, DEFAULT_VOICE].filter(Boolean)
  for (const n of tryNames) { const f = path.join(dir, `${n}.onnx`); if (fs.existsSync(f)) return f }
  try { const any = fs.readdirSync(dir).find((f) => f.endsWith('.onnx')); if (any) return path.join(dir, any) } catch { /* no voices */ }
  return null
}
const audioDur = (f) => { try { return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim()) || 0 } catch { return 0 } }
// Synthesize text → wav. Returns { wav, dur } or null if TTS is unavailable/fails.
function tts(text, voice, outWav) {
  const model = voiceModel(voice)
  if (!model) return null
  try {
    execFileSync(path.join(PIPER_DIR, 'piper'), ['--model', model, '--output_file', outWav], { input: String(text).slice(0, 1200), cwd: PIPER_DIR, stdio: ['pipe', 'ignore', 'ignore'] })
    if (!fs.existsSync(outWav)) return null
    return { wav: outWav, dur: audioDur(outWav) }
  } catch (e) { console.log(`   (tts failed for "${String(voice)}": ${e.message})`); return null }
}
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

// Render the PiPilot logo (logo.svg) + wordmark to a transparent PNG watermark,
// on a subtle dark pill so it reads on any footage. Cached; overlaid by ffmpeg.
let _wmPath = null
async function watermarkPng() {
  if (_wmPath) return _wmPath
  let svg = ''
  try { svg = fs.readFileSync(path.join(import.meta.dirname, 'logo.svg'), 'utf8') } catch { svg = '' }
  const h = Math.max(22, Math.round(H / 18)), pad = Math.round(h * 0.4), gap = Math.round(h * 0.34)
  const html = `<style>html,body{margin:0;background:transparent}
    .w{display:inline-flex;align-items:center;gap:${gap}px;background:rgba(10,12,18,.34);border-radius:${h}px;padding:${Math.round(pad * 0.7)}px ${pad}px}
    .w svg{height:${h}px;width:auto;display:block}
    .t{font-family:'Liberation Sans','DejaVu Sans',sans-serif;font-weight:700;color:#fff;font-size:${Math.round(h * 0.82)}px;letter-spacing:-.5px;opacity:.95}</style>
    <div class="w">${svg}<span class="t">PiPilot</span></div>`
  const ctx = await (await getBrowser()).newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
  try {
    const page = await ctx.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    const el = await page.$('.w')
    _wmPath = path.join(WORK, 'wm.png')
    await el.screenshot({ path: _wmPath, omitBackground: true })
  } finally { await ctx.close() }
  return _wmPath
}

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
// Wait until the page has actually PAINTED something (not a blank white SPA that
// hasn't hydrated yet — PiPilot's Drive-backed *.pipilot.dev hosting can be slow
// to first paint). Best-effort: proceed after the timeout regardless.
async function waitForAppReady(page) {
  try { await page.waitForLoadState('networkidle', { timeout: 12000 }) } catch { /* keep going */ }
  try {
    await page.waitForFunction(() => {
      const b = document.body
      if (!b) return false
      const txt = (b.innerText || '').trim()
      return txt.length > 2 || !!b.querySelector('img,svg,canvas,button,a,input,h1,h2,[role],[class]')
    }, { timeout: 20000, polling: 300 })
  } catch { /* render check timed out — record whatever there is */ }
  await page.waitForTimeout(700) // settle for fonts/layout/entry animations
}

async function screencastSeg(out, url, steps, maxDur = 20) {
  const vdir = fs.mkdtempSync(path.join(WORK, 'cast-'))
  try {
    const ctx = await (await getBrowser()).newContext({ viewport: { width: W, height: H }, recordVideo: { dir: vdir, size: { width: W, height: H } } })
    const page = await ctx.newPage()
    // Recording starts at page creation. Load + wait for the app to render, then
    // measure how long that blank period was so we can TRIM it off the final clip.
    const t0 = Date.now()
    await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => {})
    await waitForAppReady(page)
    const loadMs = Date.now() - t0
    await installCursor(page)
    // Run the demo (or just dwell) for maxDur of VISIBLE-app time after it rendered.
    const deadline = Date.now() + maxDur * 1000
    for (const st of steps || []) {
      if (Date.now() > deadline) break
      await runStep(page, st, url).catch(() => {})
    }
    const remain = deadline - Date.now()
    if (remain > 300) await page.waitForTimeout(Math.min(remain, maxDur * 1000))
    await page.waitForTimeout(300)
    await page.close(); await ctx.close()
    const webm = fs.readdirSync(vdir).find((f) => f.endsWith('.webm'))
    if (!webm) throw new Error('no screencast recorded')
    // Trim the leading blank/load period (keep a 0.3s lead-in), then cap to maxDur.
    const trim = Math.max(0, loadMs / 1000 - 0.3)
    ff(['-ss', trim.toFixed(2), '-t', `${maxDur}`, '-i', path.join(vdir, webm), '-an', '-vf', NORM, ...SEG, out])
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
  if (st.action === 'goto') { const u = new URL(st.path, baseUrl).href; await page.goto(u, { waitUntil: 'load', timeout: 30000 }).catch(() => {}); await waitForAppReady(page); await installCursor(page); return }
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
  // Draft previews skip the network Google-fonts fetch (the slowest card step).
  if (!font || keys[font] || DRAFT) return { face: keys[font] || keys.sans, link: '' }
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
function titleCard(scene, typeDur = 0) {
  const t = resolveTheme(scene)
  const c = { ...t, ...fontFor(t.font), bg: bgFor(t), bgSolid: Array.isArray(t.bg) ? t.bg[0] : (typeof t.bg === 'string' && !/gradient\(/.test(t.bg) ? t.bg : '#0E1726') }
  const render = STYLES[t.style] || STYLES.spotlight
  const base = `${c.link}<style>html,body{margin:0;height:100%;overflow:hidden}${KF}</style>${render(scene.title, scene.sub, c)}`
  if (!typeDur || typeDur <= 0) return base
  // Typewriter: type the H1 out over `typeDur`s (synced to narration when present),
  // with a blinking caret; the subtitle fades in once typing finishes.
  const tw = `<style>@keyframes blink{50%{opacity:0}}</style><script>(function(){var h=document.querySelector('h1');if(!h)return;var full=h.textContent;h.textContent='';h.style.opacity='1';h.style.transform='none';h.style.animation='none';var car=document.createElement('span');car.textContent='|';car.style.cssText='opacity:.7;margin-left:2px;animation:blink 1s steps(1) infinite';h.appendChild(car);var sub=document.querySelector('p');if(sub){sub.style.opacity='0';sub.style.animation='none';}var n=full.length,ms=Math.max(18,${Math.round(typeDur * 1000)}/Math.max(1,n)),i=0;var tm=setInterval(function(){i++;car.remove();h.textContent=full.slice(0,i);h.appendChild(car);if(i>=n){clearInterval(tm);setTimeout(function(){car.remove();if(sub){sub.style.transition='opacity .5s';sub.style.opacity='1';}},200);}},ms);})();</script>`
  return base + tw
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
// The ffmpeg xfade transitions we allow a storyboard to request per scene.
const XF_TRANSITIONS = new Set(['fade', 'fadeblack', 'fadewhite', 'dissolve', 'wipeleft', 'wiperight', 'wipeup', 'wipedown', 'slideleft', 'slideright', 'slideup', 'slidedown', 'smoothleft', 'smoothright', 'smoothup', 'smoothdown', 'circleopen', 'circleclose', 'circlecrop', 'rectcrop', 'radial', 'zoomin', 'pixelize', 'hlslice', 'hrslice', 'vuslice', 'vdslice', 'diagtl', 'diagtr', 'diagbl', 'diagbr', 'horzopen', 'horzclose', 'vertopen', 'vertclose'])
// A varied default rotation (more interesting than fade-only) when a scene doesn't pick.
const XF_DEFAULTS = ['fade', 'slideleft', 'smoothup', 'circleopen', 'wiperight', 'dissolve', 'slideup', 'radial', 'wipeleft', 'zoomin']
function xfadeConcat(out, segs, durs, transFor = []) {
  // Single scene: nothing to crossfade — just normalize/encode the one segment
  // (an empty xfade filter would make ffmpeg fail on a missing [v] output).
  if (segs.length === 1) {
    ff(['-i', segs[0], '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', out])
    return durs[0]
  }
  let filter = '', prev = '[0:v]', acc = durs[0]
  for (let i = 1; i < segs.length; i++) {
    const label = i === segs.length - 1 ? '[v]' : `[x${i}]`
    const tr = transFor[i] || XF_DEFAULTS[(i - 1) % XF_DEFAULTS.length]
    filter += `${prev}[${i}:v]xfade=transition=${tr}:duration=${XF}:offset=${(acc - XF).toFixed(3)}${label};`
    acc += durs[i] - XF; prev = label
  }
  ff([...segs.flatMap((s) => ['-i', s]), '-filter_complex', filter.replace(/;$/, ''),
      '-map', '[v]', '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', out])
  return acc
}
// Encode speed scales with length so long 1080p videos never approach the render
// timeout (CRF governs quality; preset is mostly a size/speed trade — a faster
// preset at the same CRF is only marginally larger).
const finalPreset = (t) => (t <= 20 ? 'slow' : t <= 60 ? 'medium' : t <= 120 ? 'fast' : 'veryfast')
const WMFONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
// A burned-in caption (drawtext) shown only during [start,end] of the final timeline.
function capDraw(text, start, end) {
  const t = String(text).replace(/[\\':%]/g, '').replace(/\s+/g, ' ').slice(0, 140)
  const fsz = Math.round(H / 22)
  return `drawtext=fontfile=${WMFONT}:text='${t}':fontcolor=white:fontsize=${fsz}:x=(w-tw)/2:y=h-th-${Math.round(H * 0.09)}:box=1:boxcolor=black@0.55:boxborderw=${Math.round(fsz * 0.5)}:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`
}

// ── run ─────────────────────────────────────────────────────────────────────
;(async () => {
  const nSay = SB.scenes.filter((s) => s.say).length
  console.log(`▶  ${W}x${H}@${FPS} · ${SB.scenes.length} scenes${nSay ? ` · ${nSay} narrated${CAPTIONS ? '+captions' : ''}` : ''}${DRAFT ? ' · DRAFT' : ''}${WM ? ' · watermark' : ''}\n`)
  const credits = [], segs = []
  // Resolve music up front — the credits card needs its attribution string.
  let musicUrl = null, musicCredit = null
  if (SB.music?.url) { musicUrl = SB.music.url; musicCredit = SB.music.credit || 'music' }
  else if (SB.music?.mood) { const m = pickMusic({ mood: SB.music.mood }); musicUrl = m.url; musicCredit = m.credit }
  // Durations + start offsets are deterministic from the storyboard, so compute them
  // UP FRONT — narration is synth'd before cards render so a typewriter card can time
  // its typing to the narration length (voice-synced typewriter).
  const durOf = (s) => (s.kind === 'screencast' ? (s.dur || 12) : (s.dur || 6))
  const durs = SB.scenes.map(durOf)
  const starts = []; { let a = 0; for (let i = 0; i < durs.length; i++) { starts.push(a); a += durs[i] - (i < durs.length - 1 ? XF : 0) } }
  const narr = []
  for (let i = 0; i < SB.scenes.length; i++) {
    const s = SB.scenes[i]; if (!s.say) continue
    const v = s.voice || SB.voice
    const w = tts(s.say, v, path.join(WORK, `narr_${i}.wav`))
    if (w) { narr.push({ i, start: starts[i], dur: w.dur, wav: w.wav, text: s.say, end: starts[i] + durs[i] }); console.log(`   · narration ${i} (${v || DEFAULT_VOICE}) — ${w.dur.toFixed(1)}s`) }
  }
  const narrByScene = new Map(narr.map((n) => [n.i, n]))
  const hasNarr = narr.length > 0
  try {
    for (let i = 0; i < SB.scenes.length; i++) {
      const s = SB.scenes[i]
      const out = path.join(WORK, `seg_${String(i).padStart(2, '0')}.mp4`)
      const dur = durs[i]
      if (s.kind === 'title') {
        // Typewriter cards sync their type duration to the narration when present.
        await cardSeg(out, dur, titleCard(s, s.typewriter ? (narrByScene.get(i)?.dur || dur * 0.7) : 0))
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
      segs.push(out)
      console.log(`  · seg ${i} (${s.kind}) — ${secs().toFixed(1)}s`)
    }
    // Pre-render the watermark while the shared browser is still open (the finally
    // below closes it before the final ffmpeg encode calls watermarkPng()).
    if (WM) await watermarkPng().catch((e) => console.log(`   (watermark skipped: ${e.message})`))
  } finally { if (_browser) await _browser.close() }

  const silent = path.join(WORK, 'silent.mp4')
  // Per-boundary transitions: scene i may set `transition`; otherwise a varied default.
  const transFor = SB.scenes.map((s) => (s.transition && XF_TRANSITIONS.has(s.transition) ? s.transition : null))
  const total = xfadeConcat(silent, segs, durs, transFor)

  const finalOut = path.join(OUT, 'video.mp4')
  const crf = DRAFT ? '32' : '30'
  const preset = DRAFT ? 'ultrafast' : finalPreset(total)
  // Watermark = the real PiPilot logo (rendered from logo.svg → transparent PNG,
  // on a subtle dark pill for contrast), overlaid bottom-right. Free tier only.
  // Use the copy pre-rendered above (browser is closed now); null if it failed.
  const wmPath = _wmPath
  // Assemble ONE ffmpeg call handling any combo of: draft downscale, logo overlay,
  // burned-in captions, ducked music, and narration. Inputs: silent [+ music]
  // [+ logo png] [+ one wav per narration line].
  const inputs = ['-i', silent]
  let idx = 1, musicIdx = -1, wmIdx = -1
  if (musicUrl) { const music = curl(musicUrl, path.join(CACHE, `music_${hash(musicUrl)}.mp3`)); inputs.push('-i', music); musicIdx = idx++ }
  // NO -loop on the logo: a single-frame image + overlay's default eof_action=repeat
  // persists it for the whole video. -loop 1 makes it infinite and hangs the encode.
  if (wmPath) { inputs.push('-i', wmPath); wmIdx = idx++ }
  const narrIdx = []
  for (const n of narr) { inputs.push('-i', n.wav); narrIdx.push(idx++) }

  // ── video filter chain ──
  const vParts = []; let cur = '0:v'
  if (DRAFT) { vParts.push(`[${cur}]scale=640:-2[vs]`); cur = 'vs' }
  if (wmIdx >= 0) { const m = Math.round(H / 34); vParts.push(`[${cur}][${wmIdx}:v]overlay=W-w-${m}:H-h-${m}[vw]`); cur = 'vw' }
  // Text overlays: an explicit per-scene `caption` (always burned), or — when
  // top-level `captions:true` — the narration text as subtitles.
  const overlays = []
  SB.scenes.forEach((s, i) => {
    if (s.caption) overlays.push({ text: typeof s.caption === 'string' ? s.caption : (s.caption.text || ''), start: starts[i], end: starts[i] + durs[i] })
    else if (CAPTIONS && s.say) { const n = narrByScene.get(i); overlays.push({ text: s.say, start: starts[i], end: Math.min(starts[i] + durs[i], starts[i] + (n?.dur || durs[i]) + 0.4) }) }
  })
  overlays.forEach((o, k) => { if (!o.text) return; const oo = `cap${k}`; vParts.push(`[${cur}]${capDraw(o.text, o.start, o.end)}[${oo}]`); cur = oo })

  // ── audio: ducked music + narration (each placed at its scene offset) ──
  const aParts = [], mixLabels = []
  if (musicIdx >= 0) {
    const fIn = Math.min(1.5, total), fOutStart = Math.max(0, total - 2), fOutDur = Math.min(2, total - fOutStart)
    const vol = hasNarr ? 0.22 : 0.85 // duck music under narration
    aParts.push(`[${musicIdx}:a]atrim=0:${total.toFixed(2)},afade=t=in:st=0:d=${fIn.toFixed(2)},afade=t=out:st=${fOutStart.toFixed(2)}:d=${fOutDur.toFixed(2)},volume=${vol}[amus]`)
    mixLabels.push('[amus]')
  }
  narr.forEach((n, k) => { const ms = Math.round(n.start * 1000); aParts.push(`[${narrIdx[k]}:a]adelay=${ms}|${ms},volume=1.35[nd${k}]`); mixLabels.push(`[nd${k}]`) })
  let haveAudio = false
  if (mixLabels.length === 1) { aParts.push(`${mixLabels[0]}anull[a]`); haveAudio = true }
  else if (mixLabels.length > 1) { aParts.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:normalize=0:duration=longest[a]`); haveAudio = true }

  const fc = [...vParts, ...aParts].join(';')
  const args = [...inputs]
  if (fc) args.push('-filter_complex', fc)
  args.push('-map', vParts.length ? `[${cur}]` : '0:v')
  if (haveAudio) args.push('-map', '[a]')
  args.push('-c:v', 'libx264', '-crf', crf, '-preset', preset, '-pix_fmt', 'yuv420p', '-movflags', '+faststart')
  if (haveAudio) args.push('-c:a', 'aac', '-b:a', '128k')
  // Bound to the finite video when music is present (music is trimmed to `total`).
  if (musicIdx >= 0) args.push('-shortest')
  args.push(finalOut)
  ff(args)

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
