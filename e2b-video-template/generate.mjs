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
import { pickMusic, pickPhotos, pickVideo, videoCorpusSize } from './stockdb.mjs'
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
// Crossfade seconds — the agent can tune the transition length per storyboard
// (`transition_duration`). Clamped so it can't swallow a whole scene.
const XF = Math.max(0, Math.min(2.5, Number(SB.transition_duration ?? SB.transitionDuration ?? 0.6) || 0.6))
const KEY = process.env.PIXABAY_KEY
// a0.dev keyless image generation — resolves a scene's `prompt` to a bespoke image
// at render time (accurate, unlike stock keyword guessing). Returns a 302→webp URL
// that curl -L + ffmpeg consume directly. Image models misspell text, so we append
// a strict no-text guard (use title/caption cards for any on-screen words).
const A0_ASPECTS = new Set(['1:1', '16:9', '9:16', '4:5', '5:4', '4:3', '3:4', '2:3', '3:2'])
function a0ImageUrl(prompt, seedBase = 0) {
  const asp = A0_ASPECTS.has(SB.aspect) ? SB.aspect : (W >= H ? '16:9' : '9:16')
  const p = String(prompt || '').trim()
  const guarded = /\bno\s+(text|words|lettering|type)\b/i.test(p)
    ? p
    : `${p}. Pure visual imagery only — do NOT render any text, words, letters, numbers, captions, labels or watermarks.`
  const key = p + ':' + seedBase
  let sd = 0; for (let i = 0; i < key.length; i++) sd = (sd * 31 + key.charCodeAt(i)) | 0
  const seed = Math.abs(sd) % 1_000_000_000
  return `https://api.a0.dev/assets/image?text=${encodeURIComponent(guarded)}&aspect=${encodeURIComponent(asp)}&seed=${seed}`
}
// DRAFT=1 → fast, low-res preview (ultrafast encode, downscaled, skip Google fonts).
const DRAFT = process.env.DRAFT === '1' || process.env.DRAFT === 'true'
// WATERMARK set (a label, or '1' for the default) → burn a corner watermark on the
// final video (free tier). SERVER sets this from the user's plan; the engine just honors it.
const WM = process.env.WATERMARK
const WM_TEXT = WM && WM !== '1' && WM !== 'true' ? String(WM).slice(0, 40) : 'Made with PiPilot'
const PIPER_DIR = process.env.PIPER_DIR || '/opt/piper'
const DEFAULT_VOICE = 'amy'
const CAPTIONS = SB.captions === true || SB.captions === 'true'
// `video` scenes prefer Pixabay b-roll, but fall back to an a0-generated image when
// no key is connected — so a missing PIXABAY_KEY no longer fails the whole render.
const needsPixabay = SB.scenes.some((s) => s.kind === 'video')
if (needsPixabay) {
  const corpus = videoCorpusSize()
  if (corpus) console.log(`   video scenes → baked B-roll corpus (${corpus.toLocaleString()} clips, zero-API)`)
  else if (KEY) console.log('   video scenes → live Pixabay (no baked corpus in this template)')
  else console.log('   (no B-roll corpus and no PIXABAY_KEY — `video` scenes fall back to a0-generated images)')
}

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
  const h = Math.max(18, Math.round(H / 24)), pad = Math.round(h * 0.4), gap = Math.round(h * 0.34)
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

// Free-tier animated END SCREEN — a short branded PiPilot outro (logo + "Made with PiPilot")
// appended after the content so it's clear the video was created with PiPilot.
function outroCard() {
  let svg = ''
  try { svg = fs.readFileSync(path.join(import.meta.dirname, 'logo.svg'), 'utf8') } catch { svg = '' }
  const lh = Math.round(H / 7)
  return `<style>html,body{margin:0;height:100%}
    body{background:#0a0c12;display:flex;align-items:center;justify-content:center;overflow:hidden;font-family:'Liberation Sans','DejaVu Sans',sans-serif}
    .pulse{position:absolute;width:${lh * 3}px;height:${lh * 3}px;border-radius:50%;background:radial-gradient(circle,rgba(120,140,255,.22),transparent 70%);animation:pulse 2.6s ease-in-out infinite}
    .wrap{position:relative;display:flex;flex-direction:column;align-items:center;gap:${Math.round(H * 0.028)}px;opacity:0;transform:translateY(${Math.round(H * 0.02)}px) scale(.96);animation:in .9s cubic-bezier(.2,.7,.3,1) forwards}
    .logo svg{height:${lh}px;width:auto;display:block;filter:drop-shadow(0 10px 34px rgba(120,140,255,.4))}
    .made{color:#aeb6c8;font-size:${Math.round(H * 0.026)}px;letter-spacing:.5px;font-weight:600;opacity:0;animation:in .8s ease .35s forwards}
    .brand{color:#fff;font-size:${Math.round(H * 0.06)}px;font-weight:800;letter-spacing:-1px;opacity:0;animation:in .8s ease .45s forwards}
    @keyframes in{to{opacity:1;transform:none}}
    @keyframes pulse{0%,100%{transform:scale(.9);opacity:.45}50%{transform:scale(1.12);opacity:.85}}</style>
    <div class="pulse"></div>
    <div class="wrap"><span class="logo">${svg}</span><span class="made">Made with</span><span class="brand">PiPilot</span></div>`
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

// Cursor-aware helpers handed to a raw `script` so agent-written Playwright routines
// still produce the animated cursor + click ripples (they wrap the same runStep path),
// while `page` stays available for anything the DSL can't express.
function scriptHelpers(page, baseUrl) {
  return {
    page,
    goto: (path) => runStep(page, { action: 'goto', path }, baseUrl),
    click: (target) => runStep(page, { action: 'click', selector: target }, baseUrl),
    type: (target, text, slowmo) => runStep(page, { action: 'type', selector: target, text, slowmo }, baseUrl),
    hover: (target) => runStep(page, { action: 'hover', selector: target }, baseUrl),
    scrollTo: (target) => runStep(page, { action: 'scrollTo', selector: target }, baseUrl),
    press: (key) => page.keyboard.press(key).catch(() => {}),
    wait: (ms) => page.waitForTimeout(Math.min(Number(ms) || 0, 8000)),
    log: (m) => console.log(`      [script] ${String(m).slice(0, 200)}`),
  }
}
async function screencastSeg(out, url, steps, maxDur = 20, script = null) {
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
    if (script && typeof script === 'string') {
      // Agent-authored Playwright routine — full control flow, run with cursor-aware
      // helpers + raw `page`, capped to the scene duration so it can never hang a render.
      const h = scriptHelpers(page, url)
      const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
      let fn
      try { fn = new AsyncFunction('page', 'goto', 'click', 'type', 'hover', 'scrollTo', 'press', 'wait', 'log', script) }
      catch (e) { console.log(`      script compile error: ${e.message}`) }
      if (fn) {
        await Promise.race([
          fn(h.page, h.goto, h.click, h.type, h.hover, h.scrollTo, h.press, h.wait, h.log).catch((e) => console.log(`      script error: ${e.message}`)),
          new Promise((r) => setTimeout(r, maxDur * 1000)),
        ])
        console.log(`      script done (${url})`)
      }
    } else {
      let ran = 0
      const actionable = (steps || []).filter((st) => st.action !== 'wait')
      for (const st of steps || []) {
        if (Date.now() > deadline) break
        const ok = await runStep(page, st, url).catch(() => false)
        if (ok && st.action !== 'wait') ran++
      }
      if (actionable.length) console.log(`      steps: ${ran}/${actionable.length} matched (${url})`)
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
async function moveCursorTo(page, loc) {
  const box = await loc.boundingBox().catch(() => null)
  if (!box) return null
  const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2)
  await page.evaluate(([x, y]) => { const c = document.getElementById('__ppcur'); if (c) { c.style.left = x + 'px'; c.style.top = y + 'px' } }, [x, y]).catch(() => {})
  await page.mouse.move(x, y)
  await page.waitForTimeout(550)
  return { x, y }
}
// Resolve a step's target FORGIVINGLY. The agent often can't see the live DOM, so a
// `selector`/`ref` may be a CSS selector OR just a visible label. Try, in order: the
// string as a selector, then text / button / link / placeholder / label matches — and
// return the FIRST that actually exists. This is what makes agent-authored demos click.
async function resolveLoc(page, st) {
  const raw = (st.selector || st.ref || '').toString().trim()
  if (!raw) return null
  const label = raw.startsWith('text=') ? raw.slice(5).trim() : raw
  const makers = []
  if (raw.startsWith('text=')) {
    makers.push(() => page.getByText(label, { exact: false }))
  } else {
    makers.push(() => page.locator(raw)) // treat as CSS/selector first
  }
  // Fuzzy fallbacks by visible label — order matters (most specific interactive first).
  makers.push(
    () => page.getByRole('button', { name: label, exact: false }),
    () => page.getByRole('link', { name: label, exact: false }),
    () => page.getByPlaceholder(label, { exact: false }),
    () => page.getByRole('textbox', { name: label, exact: false }),
    () => page.getByLabel(label, { exact: false }),
    () => page.getByText(label, { exact: false }),
  )
  for (const mk of makers) {
    try { const loc = mk().first(); if (await loc.count().catch(() => 0)) return loc } catch { /* invalid selector for this engine — try next */ }
  }
  return null
}
async function ripple(page, x, y) {
  await page.evaluate(([x, y]) => { const r = document.createElement('div'); r.className = '__pprip'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 600) }, [x, y]).catch(() => {})
}
// Map a storyboard step → Playwright. Returns true if the step did something, false if
// its target couldn't be found (so the caller can log a per-step outcome — silent misses
// were exactly why agent-authored demos looked like they "did nothing").
async function runStep(page, st, baseUrl) {
  const tgt = st.selector || st.ref || ''
  if (st.action === 'goto') { const u = new URL(st.path, baseUrl).href; await page.goto(u, { waitUntil: 'load', timeout: 30000 }).catch(() => {}); await waitForAppReady(page); await installCursor(page); return true }
  if (st.action === 'wait') { await page.waitForTimeout(Math.min(st.ms, 5000)); return true }
  if (st.action === 'press') { await page.keyboard.press(st.key).catch(() => {}); return true }
  const loc = await resolveLoc(page, st)
  if (!loc) { console.log(`      ✗ ${st.action} "${tgt}" — no matching element`); return false }
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  const pos = await moveCursorTo(page, loc)
  if (st.action === 'hover') return true
  if (st.action === 'scrollTo') return true
  if (st.action === 'click') { if (pos) await ripple(page, pos.x, pos.y); await loc.click({ timeout: 4000 }).catch(() => {}); return true }
  if (st.action === 'type') {
    if (pos) await ripple(page, pos.x, pos.y)
    await loc.click({ timeout: 4000 }).catch(() => {})
    for (const ch of String(st.text)) { await page.keyboard.type(ch); await page.waitForTimeout(st.slowmo || 45) }
    return true
  }
  return true
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
  // Speed is CAPPED (32–70ms/char) so a short title never types agonizingly slowly when
  // synced to a long narration — it types snappily then holds. Only a dedicated text span
  // is mutated per tick (caret is a stable sibling) so there's no per-frame reflow jank.
  const tw = `<style>@keyframes blink{50%{opacity:0}}</style><script>(function(){var h=document.querySelector('h1');if(!h)return;var full=h.textContent;h.textContent='';h.style.opacity='1';h.style.transform='none';h.style.animation='none';var t=document.createElement('span');h.appendChild(t);var car=document.createElement('span');car.textContent='|';car.style.cssText='margin-left:3px;animation:blink 1s steps(1) infinite';h.appendChild(car);var sub=document.querySelector('p');if(sub){sub.style.opacity='0';sub.style.animation='none';}var n=full.length,ms=Math.min(70,Math.max(32,${Math.round(typeDur * 1000)}/Math.max(1,n))),i=0;var tm=setInterval(function(){i++;t.textContent=full.slice(0,i);if(i>=n){clearInterval(tm);setTimeout(function(){car.style.display='none';if(sub){sub.style.transition='opacity .5s';sub.style.opacity='1';}},250);}},ms);})();</script>`
  return base + tw
}
// Canvas — a FULLY AGENT-AUTHORED scene. The storyboard supplies a self-contained HTML/CSS body
// which we render at full resolution and record for `dur`s (CSS animations/keyframes are captured).
// This is how the agent HANDCRAFTS text-heavy or bespoke scenes (comparison tables, feature grids,
// animated stat counters, quotes, code blocks, bullet reveals) with PERFECT text — no image model to
// misspell. The video's theme is exposed as CSS custom properties + its Google font is pre-loaded, so
// canvas scenes match the rest of the video. Body should use relative units so it fills any aspect.
function canvasHtml(scene) {
  const t = resolveTheme(scene)
  const f = fontFor(t.font)
  const solid = Array.isArray(t.bg) ? t.bg[0] : (typeof t.bg === 'string' && !/gradient\(/.test(t.bg) ? t.bg : '#0E1726')
  const vars = `--bg:${esc(solid)};--bg2:${esc(t.bg2 || solid)};--accent:${esc(t.accent)};--text:${esc(t.text)};--sub:${esc(t.sub)};--font:${f.face}`
  const body = String(scene.html || scene.canvas || '').trim()
    || `<div style="position:fixed;inset:0;display:grid;place-items:center;color:var(--text);font-family:var(--font)">canvas</div>`
  // Base font-size scales with canvas height so the agent can size with `em`. KF gives it the
  // built-in g/r/f keyframes (bar-grow / rise-in / fade-in) to reuse alongside its own @keyframes.
  return `${f.link}<style>
    :root{${vars}}
    *{box-sizing:border-box}
    html,body{margin:0;width:100%;height:100%;overflow:hidden}
    body{background:${bgFor(t)};color:var(--text);font-family:var(--font);font-size:${Math.round(H / 40)}px;line-height:1.4}
    ${KF}
  </style>${body}`
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
// A burned-in caption (drawtext). ffmpeg text is STATIC, so a "typewriter" caption is
// built as a CHAIN of reveals (cumulative substrings, each enabled for one time slice).
const _capText = (text) => String(text).replace(/[\\':%]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200)
// Caption sizing: font relative to height, and a per-line char budget derived from FRAME WIDTH so
// text NEVER overflows the frame (the old single-line drawtext ran off both edges on long narration).
const CAP_FSZ = Math.round(H / 27)
const CAP_LH = Math.round(CAP_FSZ * 1.34)
const CAP_MAXLINE = Math.max(24, Math.min(48, Math.floor((W * 0.84) / (CAP_FSZ * 0.52))))
// Greedy word-wrap into lines that fit CAP_MAXLINE chars.
function wrapLines(t, maxChars) {
  const words = String(t).split(' ').filter(Boolean)
  const lines = []
  let cur = ''
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w
    if (next.length > maxChars && cur) { lines.push(cur); cur = w } else cur = next
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}
// One drawtext per line, bottom-anchored as a block, each line centered on its own row.
function lineDrawtexts(lines, start, end) {
  const n = lines.length
  const bottomPad = Math.round(H * 0.085)
  return lines.map((ln, i) => {
    const yFromBottom = bottomPad + (n - 1 - i) * CAP_LH
    return `drawtext=fontfile=${WMFONT}:text='${ln}':fontcolor=white:fontsize=${CAP_FSZ}:x=(w-tw)/2:y=h-th-${yFromBottom}:box=1:boxcolor=black@0.55:boxborderw=${Math.round(CAP_FSZ * 0.42)}:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`
  })
}
function capDraw(text, start, end) { return lineDrawtexts(wrapLines(_capText(text), CAP_MAXLINE), start, end) }
// Returns one or more drawtext filters. For typewriter, reveal WORD-BY-WORD (cumulative, re-wrapped
// each step) over the caption span — reads like typing and scales to full narration sentences
// without the char-by-char filter bloat / 64-char cap the old version fell back to static on.
const CAP_MAX_STEPS = 14 // cap reveal steps per caption so long videos don't build a giant filtergraph
function capDraws(text, start, end, typewriter) {
  const t = _capText(text)
  const words = t.split(' ').filter(Boolean)
  const n = words.length
  if (!typewriter || n <= 1) return capDraw(text, start, end)
  const span = Math.max(0.2, end - start)
  const typeDur = Math.min(span * 0.9, Math.max(0.6, n * 0.42)) // reveal pace ~2.4 words/s, within span
  // Reveal in at most CAP_MAX_STEPS chunks (word-by-word for short lines, word-groups for long ones)
  // — keeps the typing feel while bounding drawtext count (a 70-scene video otherwise = thousands).
  const steps = Math.min(n, CAP_MAX_STEPS)
  const dt = typeDur / steps
  const out = []
  for (let s = 1; s <= steps; s++) {
    const wc = s === steps ? n : Math.max(1, Math.round((s * n) / steps))
    const a = start + (s - 1) * dt
    const b = s < steps ? start + s * dt : end
    lineDrawtexts(wrapLines(words.slice(0, wc).join(' '), CAP_MAXLINE), a, b).forEach((d) => out.push(d))
  }
  return out
}

// ── run ─────────────────────────────────────────────────────────────────────
;(async () => {
  const nSay = SB.scenes.filter((s) => s.say).length
  console.log(`▶  ${W}x${H}@${FPS} · ${SB.scenes.length} scenes${nSay ? ` · ${nSay} narrated${CAPTIONS ? '+captions' : ''}` : ''}${DRAFT ? ' · DRAFT' : ''}${WM ? ' · watermark' : ''}\n`)
  const credits = [], segs = []
  let hasOutro = false
  // Resolve music up front — the credits card needs its attribution string.
  // A scene may carry its OWN `music` ({mood}|{url}|null) to SWITCH the track; scenes without one
  // inherit the top-level SB.music. Contiguous scenes sharing a track become ONE looped segment,
  // and the track crossfades when a scene selects a different one. (One SB.music → one segment.)
  const resolveTrack = (m) => {
    if (!m) return null
    if (m.url) return { url: m.url, credit: m.credit || 'music' }
    if (m.mood) { try { const p = pickMusic({ mood: m.mood }); return { url: p.url, credit: p.credit } } catch { return null } }
    return null
  }
  const _sceneMusic = SB.scenes.map((s) => resolveTrack(Object.prototype.hasOwnProperty.call(s, 'music') ? s.music : SB.music))
  const musicSegments = [] // { url, credit, from, to } — scene index range
  _sceneMusic.forEach((t, i) => {
    if (!t) return
    const last = musicSegments[musicSegments.length - 1]
    if (last && last.url === t.url && last.to === i - 1) last.to = i
    else musicSegments.push({ url: t.url, credit: t.credit, from: i, to: i })
  })
  const musicCredit = [...new Set(musicSegments.map((s) => s.credit).filter(Boolean))].join(' · ') || null
  // Durations + start offsets are deterministic from the storyboard, so compute them
  // UP FRONT — narration is synth'd before cards render so a typewriter card can time
  // its typing to the narration length (voice-synced typewriter).
  const durOf = (s) => (s.kind === 'screencast' ? (s.dur || 12) : (s.dur || 6))
  const durs = SB.scenes.map(durOf)
  // Synthesize narration FIRST, then EXTEND each narrated scene so its voiceover fits
  // inside its own scene (+ a short tail). Otherwise a long `say` runs past the cut and
  // bleeds into the next scene. Offsets are computed AFTER, from the corrected durations.
  const narrRaw = []
  for (let i = 0; i < SB.scenes.length; i++) {
    const s = SB.scenes[i]
    if (!s.say) { narrRaw.push(null); continue }
    const v = s.voice || SB.voice
    const w = tts(s.say, v, path.join(WORK, `narr_${i}.wav`))
    narrRaw.push(w || null)
    if (w) { durs[i] = Math.max(durs[i], w.dur + 0.6); console.log(`   · narration ${i} (${v || DEFAULT_VOICE}) — ${w.dur.toFixed(1)}s`) }
  }
  const starts = []; { let a = 0; for (let i = 0; i < durs.length; i++) { starts.push(a); a += durs[i] - (i < durs.length - 1 ? XF : 0) } }
  const narr = []
  for (let i = 0; i < narrRaw.length; i++) { const w = narrRaw[i]; if (w) narr.push({ i, start: starts[i], dur: w.dur, wav: w.wav, text: SB.scenes[i].say, end: starts[i] + durs[i] }) }
  const narrByScene = new Map(narr.map((n) => [n.i, n]))
  const hasNarr = narr.length > 0
  try {
    for (let i = 0; i < SB.scenes.length; i++) {
      const s = SB.scenes[i]
      const out = path.join(WORK, `seg_${String(i).padStart(2, '0')}.mp4`)
      const dur = durs[i]
      const cBefore = credits.length // to report each scene's resolved asset source in the log
      if (s.kind === 'title') {
        // Typewriter cards sync their type duration to the narration when present.
        await cardSeg(out, dur, titleCard(s, s.typewriter ? (narrByScene.get(i)?.dur || dur * 0.7) : 0))
      } else if (s.kind === 'video') {
        // A user-supplied asset URL (s.src / s.image_url) wins — their own footage/photo.
        const userSrc = s.src || s.image_url || s.asset
        // ZERO-API baked corpus first — genre-appropriate Pixabay B-roll from
        // pixabay_videos.jsonl (deterministic per scene index, no key needed).
        // Returns null only when the corpus file is absent → fall through below.
        const clip = userSrc ? null : pickVideo({ keyword: s.keyword || s.q || s.prompt || '', aspect: SB.aspect, minDur: s.dur, seed: i })
        if (userSrc) {
          credits.push('provided')
          kenBurnsSeg(out, userSrc, dur, s.forward !== false)
        } else if (clip) {
          credits.push(clip.credit)
          brollSeg(out, clip.url_medium || clip.url, dur, s.start || 0)
        } else {
          // Corpus absent → fall back: live Pixabay b-roll (if a key is present),
          // else an a0-generated image (Ken Burns), so `video` scenes always resolve.
          const hits = KEY ? pixabayVideo(s.q || s.prompt || '') : []
          const h = hits[(s.pick || 0) % Math.max(1, hits.length)]
          if (h) {
            credits.push(`${h.user} / Pixabay`)
            brollSeg(out, (h.videos.medium || h.videos.small || h.videos.tiny).url, dur, s.start || 0)
          } else {
            credits.push('AI-generated (a0)')
            kenBurnsSeg(out, a0ImageUrl(s.prompt || s.q || 'cinematic abstract background', i), dur, s.forward !== false)
          }
        }
      } else if (s.kind === 'still' || s.kind === 'image') {
        // Resolution priority: a user-supplied asset URL (their logo / company photos) →
        // a bespoke a0-generated image (from `prompt`) → the baked stock corpus.
        const userSrc = s.src || s.image_url || s.asset
        if (userSrc) {
          credits.push('provided')
          kenBurnsSeg(out, userSrc, dur, s.forward !== false)
        } else if (s.prompt) {
          credits.push('AI-generated (a0)')
          kenBurnsSeg(out, a0ImageUrl(s.prompt, (s.pick || 0) + i), dur, s.forward !== false)
        } else {
          const src = s.id ? { id: s.id } : s.topic ? { topic: s.topic } : s.collection ? { collection: s.collection } : { keyword: s.keyword }
          const [photo] = pickPhotos({ ...src, color: s.color, orientation: s.orientation, n: 1, seed: (s.pick || 0) + i })
          if (!photo?.url) throw new Error(`no photo resolved for scene ${i}`)
          credits.push(photo.credit)
          kenBurnsSeg(out, photo.url, dur, s.forward !== false)
        }
      } else if (s.kind === 'canvas') {
        // Agent-handcrafted HTML scene (perfect text, custom layout, CSS animation).
        await cardSeg(out, dur, canvasHtml(s))
      } else if (s.kind === 'screencast') {
        await screencastSeg(out, s.url, s.steps, s.dur || 12, s.script)
      } else { // credits (only rendered when the storyboard explicitly includes a credits scene)
        await cardSeg(out, dur, creditsCard([...new Set([...credits, musicCredit].filter(Boolean))], s))
      }
      segs.push(out)
      const src = credits.length > cBefore ? ` [${credits[credits.length - 1]}]` : ''
      console.log(`  · seg ${i} (${s.kind})${src} — ${secs().toFixed(1)}s`)
    }
    // Free tier → append an animated PiPilot end-screen (browser still open so cardSeg works).
    if (WM) {
      try { const oseg = path.join(WORK, 'seg_outro.mp4'); await cardSeg(oseg, 2.8, outroCard()); segs.push(oseg); durs.push(2.8); hasOutro = true }
      catch (e) { console.log(`   (outro skipped: ${e.message})`) }
    }
    // Pre-render the watermark while the shared browser is still open (the finally
    // below closes it before the final ffmpeg encode calls watermarkPng()).
    if (WM) await watermarkPng().catch((e) => console.log(`   (watermark skipped: ${e.message})`))
  } finally { if (_browser) await _browser.close() }

  const silent = path.join(WORK, 'silent.mp4')
  // Per-boundary transitions: scene i may set `transition`; otherwise a varied default.
  const transFor = SB.scenes.map((s) => (s.transition && XF_TRANSITIONS.has(s.transition) ? s.transition : null))
  if (hasOutro) transFor.push('fadeblack') // the outro's transition-in
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
  let idx = 1, wmIdx = -1
  // One LOOPED input per music segment (-stream_loop -1 → the track repeats to fill long scenes).
  const musicSegIdx = []
  for (const seg of musicSegments) {
    const music = curl(seg.url, path.join(CACHE, `music_${hash(seg.url)}.mp3`))
    inputs.push('-stream_loop', '-1', '-i', music); musicSegIdx.push(idx++)
  }
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
    if (s.caption) {
      const obj = typeof s.caption === 'string' ? { text: s.caption } : (s.caption || {})
      overlays.push({ text: obj.text || '', typewriter: obj.typewriter === true, start: starts[i], end: starts[i] + durs[i] })
    } else if (CAPTIONS && s.say) { const n = narrByScene.get(i); overlays.push({ text: s.say, typewriter: true, start: starts[i], end: Math.min(starts[i] + durs[i], starts[i] + (n?.dur || durs[i]) + 0.4) }) }
  })
  overlays.forEach((o, k) => {
    if (!o.text) return
    capDraws(o.text, o.start, o.end, o.typewriter).forEach((d, j) => { const oo = `cap${k}_${j}`; vParts.push(`[${cur}]${d}[${oo}]`); cur = oo })
  })

  // ── audio: ducked music (per segment, looped + crossfaded at switches) + narration ──
  const aParts = [], mixLabels = []
  const vol = hasNarr ? 0.22 : 0.85 // duck music under narration
  musicSegments.forEach((seg, k) => {
    const segStart = starts[seg.from] || 0
    const segEnd = Math.min(total, (starts[seg.to] || 0) + (durs[seg.to] || 0))
    const segDur = Math.max(0.5, segEnd - segStart)
    const fIn = Math.min(1.2, segDur / 3), fOut = Math.min(1.5, segDur / 3)
    const ms = Math.round(segStart * 1000)
    aParts.push(`[${musicSegIdx[k]}:a]atrim=0:${segDur.toFixed(2)},afade=t=in:st=0:d=${fIn.toFixed(2)},afade=t=out:st=${(segDur - fOut).toFixed(2)}:d=${fOut.toFixed(2)},volume=${vol},adelay=${ms}|${ms}[amus${k}]`)
    mixLabels.push(`[amus${k}]`)
  })
  narr.forEach((n, k) => { const ms = Math.round(n.start * 1000); aParts.push(`[${narrIdx[k]}:a]adelay=${ms}|${ms},volume=1.35[nd${k}]`); mixLabels.push(`[nd${k}]`) })
  let haveAudio = false
  if (mixLabels.length === 1) { aParts.push(`${mixLabels[0]}anull[a]`); haveAudio = true }
  else if (mixLabels.length > 1) { aParts.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:normalize=0:duration=longest[a]`); haveAudio = true }

  const fc = [...vParts, ...aParts].join(';')
  const args = [...inputs]
  // Pass the filtergraph via a FILE, not argv: a long narrated/captioned video builds thousands
  // of drawtext filters, and a single `-filter_complex` argv string that exceeds Linux's 128KB
  // per-argument limit (MAX_ARG_STRLEN) makes spawn fail with E2BIG. `-filter_complex_script`
  // reads the identical graph from disk, so it scales to any length.
  if (fc) {
    const fcFile = path.join(WORK, 'filtergraph.txt')
    fs.writeFileSync(fcFile, fc)
    args.push('-filter_complex_script', fcFile)
  }
  args.push('-map', vParts.length ? `[${cur}]` : '0:v')
  if (haveAudio) args.push('-map', '[a]')
  args.push('-c:v', 'libx264', '-crf', crf, '-preset', preset, '-pix_fmt', 'yuv420p', '-movflags', '+faststart')
  if (haveAudio) args.push('-c:a', 'aac', '-b:a', '128k')
  // Music segments are atrim-bounded (finite), so -shortest isn't needed to tame looping music.
  // Skip it when there's an outro — the branded end-screen has no audio, so -shortest would clip it.
  if (musicSegments.length && !hasOutro) args.push('-shortest')
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
