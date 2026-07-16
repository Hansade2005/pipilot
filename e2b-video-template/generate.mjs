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
import { pickMusic, pickPhotos, pickVideo, videoCorpusSize, brandLogo } from './stockdb.mjs'
import { validateStoryboard, resolveCanvas } from './storyboard.mjs'
import { cardHtml, CARD_TEMPLATES } from './cards.mjs'

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
// Live-stock API keys. The render server injects the PLATFORM keys
// (PIXABAY_KEY_VIDEOS/_IMAGES, PEXELS_KEY_VIDEOS/_IMAGES) so live lookup works for EVERY
// render with zero user setup; a user-connected PIXABAY_KEY still works as a fallback alias.
const PIXABAY_VIDEO_KEY = process.env.PIXABAY_KEY_VIDEOS || process.env.PIXABAY_KEY || ''
const PIXABAY_IMAGE_KEY = process.env.PIXABAY_KEY_IMAGES || process.env.PIXABAY_KEY || ''
const PEXELS_VIDEO_KEY = process.env.PEXELS_KEY_VIDEOS || process.env.PEXELS_KEY || ''
const PEXELS_IMAGE_KEY = process.env.PEXELS_KEY_IMAGES || process.env.PEXELS_KEY || ''
// Cobalt (YouTube → playable mp4) — resolves `ytClip` scenes IN-SANDBOX at download time, so the
// single-use, short-lived tunnel URL is minted and fetched from the SAME IP within seconds (the
// reason resolving on Vercel ahead of the render 404'd). Public default; overridable for self-host.
const COBALT_API_URL = (process.env.COBALT_API_URL || 'https://cnv.cx').replace(/\/+$/, '')
const COBALT_ORIGIN = process.env.COBALT_ORIGIN || 'https://frame.y2meta-uk.com'
const KEY = PIXABAY_VIDEO_KEY // legacy alias (needsPixabay logging + video fallback path)
// a0.dev keyless image generation — resolves a scene's `prompt` to a bespoke image
// at render time (accurate, unlike stock keyword guessing). Returns a 302→webp URL
// that curl -L + ffmpeg consume directly. Image models misspell text, so we append
// a strict no-text guard (use title/caption cards for any on-screen words).
const A0_ASPECTS = new Set(['1:1', '16:9', '9:16', '4:5', '5:4', '4:3', '3:4', '2:3', '3:2'])
function a0ImageUrl(prompt, seedBase = 0, aspectOverride) {
  const asp = aspectOverride && A0_ASPECTS.has(aspectOverride) ? aspectOverride
    : A0_ASPECTS.has(SB.aspect) ? SB.aspect : (W >= H ? '16:9' : '9:16')
  const p = String(prompt || '').trim()
  const guarded = /\bno\s+(text|words|lettering|type)\b/i.test(p)
    ? p
    : `${p}. Pure visual imagery only — do NOT render any text, words, letters, numbers, captions, labels or watermarks.`
  const key = p + ':' + seedBase
  let sd = 0; for (let i = 0; i < key.length; i++) sd = (sd * 31 + key.charCodeAt(i)) | 0
  const seed = Math.abs(sd) % 1_000_000_000
  return `https://api.a0.dev/assets/image?text=${encodeURIComponent(guarded)}&aspect=${encodeURIComponent(asp)}&seed=${seed}`
}
// Pixel dims per aspect for Pollinations (it takes width/height, not a ratio string).
const POLL_DIMS = { '1:1': [1024, 1024], '16:9': [1280, 720], '9:16': [720, 1280], '4:5': [896, 1120], '5:4': [1120, 896], '4:3': [1024, 768], '3:4': [768, 1024], '2:3': [832, 1216], '3:2': [1216, 832] }
// Pollinations (grok-imagine-pro) — free, keyless, and RENDERS TEXT CORRECTLY (headlines, wordmarks,
// poster titles). No no-text guard: the prompt (incl. any quoted words) goes through verbatim. Slower
// than a0 (~8–20s), so we only lead with it when the scene actually wants baked text.
function pollImageUrl(prompt, seedBase = 0, aspectOverride) {
  const asp = aspectOverride && A0_ASPECTS.has(aspectOverride) ? aspectOverride
    : A0_ASPECTS.has(SB.aspect) ? SB.aspect : (W >= H ? '16:9' : '9:16')
  const [w, h] = POLL_DIMS[asp] || POLL_DIMS['16:9']
  const p = String(prompt || '').trim()
  const key = p + ':' + seedBase
  let sd = 0; for (let i = 0; i < key.length; i++) sd = (sd * 31 + key.charCodeAt(i)) | 0
  const seed = Math.abs(sd) % 1_000_000_000
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?model=grok-imagine-pro&seed=${seed}&width=${w}&height=${h}&nologo=true&referrer=pipilot.dev`
}
// A still/image whose PROMPT wants text (explicit `text:true`, or quoted words in the prompt) leads
// with Pollinations (text-capable) and falls back to a0 (textless-guarded) on any failure. Otherwise
// it's the fast reliable a0 path unchanged. Returns a URL or a [primary, fallback] list for curl().
function genImageUrls(prompt, seedBase = 0, aspectOverride, wantText = false) {
  const p = String(prompt || '').trim()
  const hasQuoted = /["'][^"']{1,48}["']/.test(p) // "Sale 50% Off", 'The King' → bake it
  if (wantText || hasQuoted) return [pollImageUrl(p, seedBase, aspectOverride), a0ImageUrl(p, seedBase, aspectOverride)]
  return a0ImageUrl(p, seedBase, aspectOverride)
}
// DRAFT=1 → fast, low-res preview (ultrafast encode, downscaled, skip Google fonts).
const DRAFT = process.env.DRAFT === '1' || process.env.DRAFT === 'true'
// WATERMARK set (a label, or '1' for the default) → burn a corner watermark on the
// final video (free tier). SERVER sets this from the user's plan; the engine just honors it.
const WM = process.env.WATERMARK
const WM_TEXT = WM && WM !== '1' && WM !== 'true' ? String(WM).slice(0, 40) : 'Made with PiPilot'
// Kokoro-ONNX TTS — replaces Piper (whose espeak-ng data caused garbled/inconsistent output).
const KOKORO_MODEL = process.env.KOKORO_MODEL || '/opt/kokoro/kokoro-v1.0.onnx'
const KOKORO_VOICES = process.env.KOKORO_VOICES || '/opt/kokoro/voices-v1.0.bin'
const KOKORO_PY = process.env.KOKORO_PY || '/opt/kokoro-venv/bin/python'  // isolated venv (off Wav2Lip's numpy)
const DEFAULT_VOICE = process.env.KOKORO_VOICE || 'am_fenrir'  // bold US male; see kokoro voice table
const CAPTIONS = SB.captions === true || SB.captions === 'true'
// `video` scenes prefer Pixabay b-roll, but fall back to an a0-generated image when
// no key is connected — so a missing PIXABAY_KEY no longer fails the whole render.
// Guard: podcast/audio-only storyboards carry `turns`, not `scenes` — this top-level line runs
// before the podcast branch, so an unguarded .some() crashed every podcast render.
const needsPixabay = Array.isArray(SB.scenes) && SB.scenes.some((s) => s.kind === 'video')
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
// ── Kokoro-ONNX TTS (narration) ──────────────────────────────────────────────
// Kokoro replaces Piper: one ONNX model + a voices bin, zero espeak dependency, and
// consistent natural voices (Piper's per-subprocess espeak re-init varied the voice
// and mangled words). Voice IDs are Kokoro names (am_*/af_*/bm_*/bf_*), validated in
// Python so an unknown name never crashes the render.
const audioDur = (f) => { try { return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim()) || 0 } catch { return 0 } }

// A tiny pronunciation dictionary. Kokoro pronounces almost everything naturally (no espeak),
// so we only override the brand name. Add entries here ONLY if you hear a specific word mangled.
const SAY_AS = [
  [/\bPiPilot\b/gi, 'Pie Pilot'],
]
// Normalise a spoken line before Piper: strip LaTeX the model sometimes leaves in `say` (Piper reads
// "$10^{15}$" literally) → plain spoken words, and apply the pronunciation dictionary.
function speakable(text) {
  let s = String(text || '')
  // LaTeX / math notation → spoken words.
  s = s.replace(/\$\s*([^$]*?)\s*\$/g, '$1')                 // drop $…$ delimiters
  s = s.replace(/\\text\s*\{([^}]*)\}/g, '$1')               // \text{million} → million
  s = s.replace(/\\(?:mathrm|mathbf|mathit|rm|bf|it)\s*\{([^}]*)\}/g, '$1')
  s = s.replace(/([0-9A-Za-z])\s*\^\s*\{([^}]*)\}/g, '$1 to the power of $2')  // 10^{15} → 10 to the power of 15
  s = s.replace(/([0-9A-Za-z])\s*\^\s*([0-9A-Za-z]+)/g, '$1 to the power of $2')  // 10^15
  s = s.replace(/([0-9A-Za-z])\s*_\s*\{([^}]*)\}/g, '$1 $2')  // subscripts → spoken
  s = s.replace(/\\times\b/g, ' times ').replace(/\\cdot\b/g, ' times ')
  s = s.replace(/\\[a-zA-Z]+/g, ' ')                          // strip any remaining \commands
  s = s.replace(/[{}]/g, ' ')                                 // stray braces
  for (const [re, to] of SAY_AS) s = s.replace(re, to)
  return s.replace(/\s{2,}/g, ' ').trim()
}

// Kokoro synthesis via a tiny Python shim. The model is loaded ONCE per Python process
// (cached on the interpreter via a module attribute); each scene is one execFileSync call.
// An unknown voice ID falls back to DEFAULT_VOICE inside Python (validated against the
// loaded voice list) so a bad name in a storyboard never breaks the render.
// The shim script is written once and reused. Returns { wav, dur } or null on failure.
const TTS_SHIM = path.join(WORK, '_kokoro_tts.py')
let _ttsShimWritten = false
function writeTtsShim() {
  if (_ttsShimWritten) return
  fs.writeFileSync(TTS_SHIM, [
    'import sys, soundfile as sf',
    'from kokoro_onnx import Kokoro',
    'model_path, voices_path, text, voice, out = sys.argv[1:6]',
    'speed = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0',
    '# Load once per process (cached on the module) so multi-call renders stay fast-ish.',
    'k = getattr(Kokoro, "_pp_instance", None)',
    'if k is None:',
    '    k = Kokoro(model_path, voices_path); Kokoro._pp_instance = k',
    'try:',
    '    voices = set(k.get_voices())',
    'except Exception:',
    '    voices = set()',
    'if voices and voice not in voices:',
    `    voice = ${JSON.stringify(DEFAULT_VOICE)}`,
    'try:',
    '    samples, sr = k.create(text, voice=voice, speed=speed, lang="en-us")',
    '    sf.write(out, samples, sr)',
    '    print("OK:%.3f" % (len(samples) / sr))',
    'except Exception as e:',
    '    print("ERR:%s" % e, file=sys.stderr); sys.exit(1)',
    '',
  ].join('\n'))
  _ttsShimWritten = true
}

// Synthesize text → wav. Returns { wav, dur } or null if TTS is unavailable/fails.
function tts(text, voice, outWav) {
  const v = voice && String(voice).trim() ? String(voice).trim() : DEFAULT_VOICE
  const speak = speakable(text)
  if (!speak) return null
  try {
    writeTtsShim()
    const res = execFileSync(KOKORO_PY, [TTS_SHIM, KOKORO_MODEL, KOKORO_VOICES, speak.slice(0, 1200), v, outWav, '1.0'], {
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000,
    }).toString().trim()
    if (!res.startsWith('OK:')) return null
    const dur = parseFloat(res.slice(3))
    if (!fs.existsSync(outWav) || !(dur > 0)) return null
    return { wav: outWav, dur }
  } catch (e) { console.log(`   (kokoro tts failed for voice "${v}": ${e.message})`); return null }
}
// In-scene MULTI-VOICE dialogue: synthesize each turn ({speaker,text,voice?,gap?}) in its own
// Kokoro voice and concatenate them (with short gaps) into ONE wav. Returns { wav, dur } exactly
// like tts(), so a scene carrying `turns` flows through the narration/extension/mixing path
// unchanged — one held visual can hold a whole back-and-forth conversation.
function ttsDialog(turns, defaultVoice, outWav) {
  const list = (Array.isArray(turns) ? turns : [])
    .map((t) => ({ text: String((t && (t.text ?? t.say)) || "").trim(), voice: (t && t.voice) || defaultVoice, gap: t && t.gap }))
    .filter((t) => t.text)
  if (!list.length) return null
  const base = path.basename(outWav, ".wav")
  const parts = []
  for (let i = 0; i < list.length; i++) {
    const w = tts(list[i].text, list[i].voice, path.join(WORK, `${base}_t${i}.wav`))
    if (!w) { console.log(`   (dialogue turn ${i} tts failed — skipped)`); continue }
    const g = list[i].gap == null ? 0.32 : Math.max(0, Math.min(3, Number(list[i].gap) || 0))
    parts.push({ wav: w.wav, dur: w.dur, gap: i < list.length - 1 ? g : 0 })
  }
  if (!parts.length) return null
  if (parts.length === 1) { fs.copyFileSync(parts[0].wav, outWav); return { wav: outWav, dur: parts[0].dur } }
  const inputs = [], seg = []
  let total = 0
  parts.forEach((prt, k) => {
    inputs.push("-i", prt.wav)
    seg.push(`[${k}:a]aformat=sample_rates=24000:channel_layouts=mono,apad=pad_dur=${prt.gap.toFixed(3)}[s${k}]`)
    total += prt.dur + prt.gap
  })
  const cat = parts.map((_, k) => `[s${k}]`).join("") + `concat=n=${parts.length}:v=0:a=1[a]`
  const fc = path.join(WORK, `${base}_dialog.txt`); fs.writeFileSync(fc, [...seg, cat].join(";"))
  try { ff([...inputs, "-filter_complex_script", fc, "-map", "[a]", outWav]) } catch (e) { console.log(`   (dialogue concat failed: ${e.message})`); return null }
  return fs.existsSync(outWav) ? { wav: outWav, dur: total } : null
}
function curl(url, dest) {
  // Accept a FALLBACK LIST: [primary, fallback, …] — try each until one downloads. Lets a slower
  // text-capable provider (Pollinations) lead with a reliable a0 fallback on failure/timeout.
  if (Array.isArray(url)) {
    let lastErr
    for (const u of url) { try { return curl(u, dest) } catch (e) { lastErr = e } }
    throw lastErr || new Error('all image sources failed')
  }
  // A LOCAL file path (baked presenter portraits, already-resolved assets) — use it directly;
  // never shell out to curl, which rejects a non-URL path with "bad/illegal format".
  if (typeof url === 'string' && !/^https?:\/\//i.test(url) && fs.existsSync(url)) return url
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest
  // --retry-all-errors so a TRANSIENT a0.dev 500 (its image API overloads) is retried, not fatal.
  try { execFileSync('curl', ['-f', '-sS', '-L', '--retry', '3', '--retry-delay', '1', '--retry-all-errors', '--max-time', '90', '-o', dest, url], { stdio: ['ignore', 'ignore', 'inherit'] }) }
  catch (e) { try { fs.unlinkSync(dest) } catch {} throw e }
  return dest
}

// ── LIVE stock search (platform keys) ────────────────────────────────────────
// Accurate media for ANY topic when the baked corpus has no match: photos + videos,
// Pixabay + Pexels, tried in order. Each returns a normalized {url, credit} or null.
// Responses are cached to disk per query so repeat keywords cost nothing.
function fetchJson(url, dest, headers = []) {
  try {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return JSON.parse(fs.readFileSync(dest, 'utf8'))
    const args = ['-f', '-sS', '-L', '--retry', '2', '--retry-delay', '1', '--max-time', '30']
    for (const h of headers) args.push('-H', h)
    args.push('-o', dest, url)
    execFileSync('curl', args, { stdio: ['ignore', 'ignore', 'inherit'] })
    return JSON.parse(fs.readFileSync(dest, 'utf8'))
  } catch { try { fs.unlinkSync(dest) } catch {} return null }
}
function livePixabayVideo(q) {
  if (!PIXABAY_VIDEO_KEY || !q) return null
  const p = new URLSearchParams({ key: PIXABAY_VIDEO_KEY, q, safesearch: 'true', per_page: '30', order: 'popular' })
  const j = fetchJson(`https://pixabay.com/api/videos/?${p}`, path.join(CACHE, `lpxv_${hash(q)}.json`))
  for (const h of (j?.hits || [])) {
    const u = (h.videos?.large || h.videos?.medium || h.videos?.small || h.videos?.tiny)?.url
    if (u) return { url: u, credit: `${h.user || 'Pixabay'} / Pixabay` }
  }
  return null
}
function livePexelsVideo(q) {
  if (!PEXELS_VIDEO_KEY || !q) return null
  const p = new URLSearchParams({ query: q, per_page: '30', orientation: H >= W ? 'portrait' : 'landscape' })
  const j = fetchJson(`https://api.pexels.com/videos/search?${p}`, path.join(CACHE, `lpev_${hash(q)}.json`), [`Authorization: ${PEXELS_VIDEO_KEY}`])
  for (const v of (j?.videos || [])) {
    const files = (v.video_files || []).filter((f) => f.file_type === 'video/mp4').sort((a, b) => (b.width || 0) - (a.width || 0))
    const f = files.find((x) => (x.width || 0) <= 1920) || files[0]
    if (f?.link) return { url: f.link, credit: `${v.user?.name || 'Pexels'} / Pexels` }
  }
  return null
}
function livePixabayPhoto(q) {
  if (!PIXABAY_IMAGE_KEY || !q) return null
  const p = new URLSearchParams({ key: PIXABAY_IMAGE_KEY, q, image_type: 'photo', safesearch: 'true', per_page: '30', order: 'popular' })
  const j = fetchJson(`https://pixabay.com/api/?${p}`, path.join(CACHE, `lpxi_${hash(q)}.json`))
  for (const h of (j?.hits || [])) { const u = h.largeImageURL || h.webformatURL; if (u) return { url: u, credit: `${h.user || 'Pixabay'} / Pixabay` } }
  return null
}
function livePexelsPhoto(q) {
  if (!PEXELS_IMAGE_KEY || !q) return null
  const p = new URLSearchParams({ query: q, per_page: '30', orientation: H >= W ? 'portrait' : 'landscape' })
  const j = fetchJson(`https://api.pexels.com/v1/search?${p}`, path.join(CACHE, `lpei_${hash(q)}.json`), [`Authorization: ${PEXELS_IMAGE_KEY}`])
  for (const ph of (j?.photos || [])) { const u = ph.src?.large2x || ph.src?.large || ph.src?.original; if (u) return { url: u, credit: `${ph.photographer || 'Pexels'} / Pexels` } }
  return null
}
// Try Pixabay then Pexels for a live motion clip / photo matching the keyword.
function liveVideo(q) { try { return livePixabayVideo(q) || livePexelsVideo(q) } catch { return null } }
function livePhoto(q) { try { return livePixabayPhoto(q) || livePexelsPhoto(q) } catch { return null } }

// ── segment builders — every segment exits in the SAME format (critical) ─────
const NORM = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1,format=yuv420p`
const SEG = ['-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast']

// Resolve a YouTube id → a fresh, playable mp4 URL via cobalt (2 calls: session key, then convert).
// Runs HERE in the sandbox so the resulting single-use tunnel is downloaded (by brollSeg) from the
// same IP, seconds later. Returns a URL or null (caller falls back to stock). No caching — the key
// and tunnel are both single-use/short-lived, so a cached response would be stale.
function resolveYtClip(vid, quality = 480) {
  const H = ['-H', `origin: ${COBALT_ORIGIN}`, '-H', `referer: ${COBALT_ORIGIN}/`, '-H', 'user-agent: Mozilla/5.0', '-H', 'accept: */*']
  const kd = path.join(CACHE, `cobkey_${hash(vid + Date.now())}.json`)
  const rd = path.join(CACHE, `cobres_${hash(vid + quality + Date.now())}.json`)
  try {
    execFileSync('curl', ['-sS', '-L', '--max-time', '25', '-o', kd, '-H', 'content-type: application/json', ...H, `${COBALT_API_URL}/v2/sanity/key`], { stdio: ['ignore', 'ignore', 'inherit'] })
    const key = JSON.parse(fs.readFileSync(kd, 'utf8'))?.key
    if (!key) return null
    const body = `link=${encodeURIComponent('https://youtu.be/' + vid)}&format=mp4&audioBitrate=128&videoQuality=${quality}&filenameStyle=pretty&vCodec=h264`
    execFileSync('curl', ['-sS', '-L', '--max-time', '45', '-X', 'POST', '-o', rd, '-H', 'content-type: application/x-www-form-urlencoded', '-H', `key: ${key}`, ...H, '--data', body, `${COBALT_API_URL}/v2/converter`], { stdio: ['ignore', 'ignore', 'inherit'] })
    const cj = JSON.parse(fs.readFileSync(rd, 'utf8'))
    return cj?.url || (Array.isArray(cj?.picker) && cj.picker[0]?.url) || null
  } catch { return null }
  finally { try { fs.unlinkSync(kd) } catch {} try { fs.unlinkSync(rd) } catch {} }
}

function brollSeg(out, url, dur, start = 0) {
  const src = curl(url, path.join(CACHE, `vid_${hash(url)}.mp4`))
  // LOOP the source so the segment ALWAYS fills the full scene `dur`. Otherwise a clip shorter
  // than the scene — common when the scene was auto-extended to fit a longer `say` voiceover —
  // ends early and leaves a BLACK tail under the continuing narration. `-stream_loop -1` replays
  // the input; `-t dur` as an OUTPUT option caps it to exactly `dur`; `-ss` seeks first for range
  // clips (a long source just reads its slice and never actually loops).
  const pre = start > 0 ? ['-ss', `${start}`] : []
  ff(['-stream_loop', '-1', ...pre, '-i', src, '-t', `${dur}`, '-an', '-vf', NORM, ...SEG, out])
}
function kenBurnsSeg(out, url, dur, forward = true) {
  const src = curl(url, path.join(CACHE, `img_${hash(Array.isArray(url) ? url[0] : url)}.jpg`))
  const cw = Math.round((W * 1.2) / 2) * 2, ch = Math.round((H * 1.2) / 2) * 2
  const p = forward ? `(t/${dur})` : `(1-(t/${dur}))`
  const vf = `scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch},` +
    `crop=${W}:${H}:x='(in_w-out_w)*${p}':y='(in_h-out_h)*${p}',fps=${FPS},setsar=1,format=yuv420p`
  ff(['-loop', '1', '-t', `${dur}`, '-i', src, '-an', '-vf', vf, ...SEG, out])
}

// ── LEVEL-1 CODE-COMPOSED DESIGN SCENE ──────────────────────────────────────
// A {kind:'design'} scene: the agent writes ONLY Python composition code against the
// vendored `Design` API (gradients, mesh, shapes, chrome type, bundled fonts — MIT, see
// design/NOTICE). We run it in the matte venv (Pillow+numpy already baked there) → a crisp
// supersampled PNG → then Ken-Burns it like any still. No browser, perfect text, deterministic.
// The engine injects: `SIZE` (the frame's ken-burns crop size), a ready `d = Design(SIZE)`, and
// `OUT`. The scene code composes on `d` and may call `d.save(OUT, grain=..)`; if it doesn't, we
// auto-save `d`. Everything the reference/ scripts do is available.
const DESIGN_DIR = process.env.DESIGN_DIR || path.join(import.meta.dirname, 'design')
const DESIGN_PY = process.env.DESIGN_PY || process.env.MATTE_PY || '/opt/matte-venv/bin/python'
function designSeg(out, code, dur, forward = true) {
  const cw = Math.round((W * 1.2) / 2) * 2, ch = Math.round((H * 1.2) / 2) * 2
  const tag = hash(String(code)).slice(0, 10)
  const png = path.join(WORK, `design_${tag}.png`)
  const shim = [
    'import sys, os',
    `sys.path.insert(0, ${JSON.stringify(path.join(DESIGN_DIR, 'lib'))})`,
    'from render import *',
    `OUT = ${JSON.stringify(png)}`,
    `SIZE = (${cw}, ${ch})`,
    'd = Design(SIZE)',
    '',
    String(code || ''),
    '',
    '# Auto-save if the scene code did not save itself (references whatever `d` is bound to).',
    'try: _ok = os.path.exists(OUT) and os.path.getsize(OUT) > 1000',
    'except Exception: _ok = False',
    'if not _ok: d.save(OUT, grain=3)',
  ].join('\n')
  const pyf = path.join(WORK, `design_${tag}.py`)
  fs.writeFileSync(pyf, shim)
  execFileSync(DESIGN_PY, [pyf], { stdio: ['ignore', 'ignore', 'inherit'], timeout: 120_000 })
  if (!fs.existsSync(png) || fs.statSync(png).size < 1000) throw new Error('design scene produced no image')
  // Ken-Burns the crisp PNG (source is already at the crop size → no upscaling of the type).
  const p = forward ? `(t/${dur})` : `(1-(t/${dur}))`
  const vf = `scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch},` +
    `crop=${W}:${H}:x='(in_w-out_w)*${p}':y='(in_h-out_h)*${p}',fps=${FPS},setsar=1,format=yuv420p`
  ff(['-loop', '1', '-t', `${dur}`, '-i', png, '-an', '-vf', vf, ...SEG, out])
}

// ── LEVEL-2 3D SCENE (Three.js in our OWN Chromium — no headless-gl/xvfb/Mesa) ──────────────
// A {kind:'scene3d'} scene: the agent writes Three.js code against a pre-built scene/camera/renderer
// (WebGL via Chromium's SwiftShader), and the engine RECORDS it for `dur` through the SAME browser
// path as canvas — so unlike a single captured frame, a scene3d can ANIMATE (assign window.update).
// The engine injects: THREE, `scene`, `camera` (PerspectiveCamera at z=6), `renderer`, W, H, and a
// seeded `rng()` (deterministic). The code adds meshes/lights, positions the camera, and may set
// `window.update = (t)=>{ ... }` to animate over the scene's seconds.
const LIB3D = process.env.LIB3D || path.join(import.meta.dirname, 'lib3d')
const THREE_JS = (() => { try { return fs.readFileSync(path.join(LIB3D, 'three.min.js'), 'utf8') } catch { return '' } })()
function three3dHtml(scene) {
  const code = String(scene.code || scene.three || scene.scene3d || '')
  const seed = Number.isFinite(+scene.seed) ? (+scene.seed >>> 0) : (hash(code) >>> 0)
  const exposure = Number.isFinite(+scene.exposure) ? +scene.exposure : 1.1
  const bg = typeof scene.bg === 'string' && /^#|rgb/.test(scene.bg) ? scene.bg : '#07030f'
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden;background:${bg}}#c{display:block;width:${W}px;height:${H}px}</style></head>
<body><canvas id="c" width="${W}" height="${H}"></canvas>
<script>${THREE_JS}</script>
<script>
const W=${W},H=${H};
let _s=${seed}>>>0; function rng(){_s=(_s*1664525+1013904223)>>>0;return _s/4294967296;}
const canvas=document.getElementById('c');
let renderer;
try{ renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true}); }
catch(e){ document.title='SCENE3D_ERR:no-webgl:'+(e&&e.message||e); }
if(renderer){
  renderer.setSize(W,H,false); renderer.setPixelRatio(1);
  try{ renderer.outputColorSpace=THREE.SRGBColorSpace; }catch(e){}
  try{ renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=${exposure}; }catch(e){}
  const scene=new THREE.Scene();
  try{ scene.background=new THREE.Color('${bg}'); }catch(e){}
  const camera=new THREE.PerspectiveCamera(50,W/H,0.1,1000); camera.position.set(0,0,6);
  window.__renderer=renderer; window.update=null;
  try{
${code}
  }catch(e){ document.title='SCENE3D_ERR:'+(e&&e.message||e); }
  window.__ok=true;
  let t0=performance.now();
  function loop(){ const t=(performance.now()-t0)/1000; try{ if(window.update)window.update(t); }catch(e){} try{ renderer.render(scene,camera); }catch(e){} requestAnimationFrame(loop); }
  renderer.render(scene,camera);
  requestAnimationFrame(loop);
  // Free the WebGL context when this page closes so it can't accumulate/leak.
  window.addEventListener('pagehide', ()=>{ try{ renderer.forceContextLoss(); renderer.dispose(); }catch(e){} });
}
</script></body></html>`
}
// A 3D scene records in its OWN throwaway browser (launched with SwiftShader flags), fully ISOLATED
// from the shared card/canvas browser — so a WebGL/GPU-process crash can never black-out the other
// scenes, and every 3D scene starts from a clean GL state (no context-pool exhaustion). One setContent
// pass (a WebGL page has no web font to double-load for), a readiness gate that throws → fallbackSeg
// rather than shipping black, then the GL context is explicitly freed before the browser closes.
async function scene3dSeg(out, scene, dur) {
  if (!THREE_JS) throw new Error('three.min.js not bundled')
  const html = three3dHtml(scene)
  const vdir = fs.mkdtempSync(path.join(WORK, 's3d-'))
  const browser = await (await import('playwright')).chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
  })
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: vdir, size: { width: W, height: H } } })
    const page = await ctx.newPage()
    const tStart = process.hrtime.bigint()
    await page.setContent(html, { waitUntil: 'load' })
    // Gate on the WebGL context actually coming up BEFORE spending `dur` — a failure throws so the
    // main loop's fallbackSeg runs (never a black clip).
    await page.waitForTimeout(350)
    const st = await page.evaluate(() => ({ title: document.title, ok: !!window.__ok }))
    if (/SCENE3D_ERR|no-webgl/.test(st.title || '') || !st.ok) throw new Error(`scene3d failed: ${st.title || 'no WebGL context'}`)
    const skip = Number(process.hrtime.bigint() - tStart) / 1e9
    await page.waitForTimeout(Math.round(dur * 1000) + 150)
    await page.evaluate(() => { try { window.__renderer && window.__renderer.forceContextLoss() } catch (e) {} }).catch(() => {})
    await page.close(); await ctx.close()
    const webm = fs.readdirSync(vdir).find((f) => f.endsWith('.webm'))
    if (!webm) throw new Error('no .webm recorded')
    ff(['-i', path.join(vdir, webm), '-ss', skip.toFixed(3), '-t', `${dur}`, '-an', '-vf', NORM, ...SEG, out])
  } finally { await browser.close().catch(() => {}); fs.rmSync(vdir, { recursive: true, force: true }) }
}

// One shared browser for ALL cards + screencasts (launching per item costs ~4.5s).
// Playwright is imported dynamically (not a hoisted static import) so the
// PLAYWRIGHT_BROWSERS_PATH override set at module top is in effect before the
// package resolves its browser registry — a static import would evaluate first.
let _browser = null
// The SHARED browser stays plain (no GPU flags) — cards/canvas/screencast are 2D and a WebGL page's
// GPU-process crash under SwiftShader would POISON this long-lived browser (every later scene goes
// black). So {kind:'scene3d'} gets its OWN throwaway browser instead (see scene3dSeg).
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

// UNIQUE COVER / POSTER — a bespoke thumbnail for the video (instead of a plain frame grab of the
// opening title card). `SB.cover` = { prompt } (a0 generates a textless cinematic BACKGROUND, and we
// overlay the video title in the theme font → a real poster) | { src } (your own image) | { html }
// (a fully custom canvas cover) | a bare string (treated as a prompt). Returns true if it wrote thumbOut.
async function makeCover(thumbOut) {
  const cov = SB.cover && typeof SB.cover === 'object' ? SB.cover
    : (typeof SB.cover === 'string' && SB.cover.trim() ? { prompt: SB.cover } : null)
  if (!cov) return false
  const t = resolveTheme(null)
  const f = fontFor(t.font)
  const firstTitle = SB.scenes.find((s) => s.kind === 'title')
  const title = esc(cov.title || SB.title || firstTitle?.title || '')
  const sub = esc(cov.subtitle || cov.sub || firstTitle?.sub || '')
  let html, bgUrl = ''
  if (cov.html) {
    html = canvasHtml({ html: cov.html })
  } else if (cov.baked && cov.prompt) {
    // Fully baked poster: Pollinations (grok) renders the cinematic art AND the title text together.
    // We compose a poster prompt from the art + the real title/subtitle and show it full-bleed (no
    // HTML overlay). Falls back to a0 (textless) if Pollinations fails.
    const posterPrompt = `${cov.prompt}. Cinematic movie-poster composition with the bold title text "${cov.title || SB.title || firstTitle?.title || ''}"${sub ? ` and smaller subtitle "${sub}"` : ''} elegantly integrated, professional typography, high contrast, dramatic lighting`
    bgUrl = String(pollImageUrl(posterPrompt, 0xC0FFEE)).replace(/'/g, '')
    html = `<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0a0c12}
      .bg{position:fixed;inset:0;background:#0a0c12 url('${bgUrl}') center/cover no-repeat}</style><div class="bg"></div>`
  } else {
    bgUrl = String(cov.src || cov.image_url || (cov.prompt ? a0ImageUrl(cov.prompt, 0xC0FFEE) : '')).replace(/'/g, '')
    const bg = bgUrl ? `background:#0a0c12 url('${bgUrl}') center/cover no-repeat` : `background:${bgFor(t)}`
    const accent = esc(t.accent)
    html = `${f.link}<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;font-family:${f.face}}
      .bg{position:fixed;inset:0;${bg}}
      .scrim{position:fixed;inset:0;background:linear-gradient(180deg,rgba(8,10,16,.12) 0%,rgba(8,10,16,.38) 45%,rgba(8,10,16,.92) 100%)}
      .txt{position:fixed;left:6%;right:6%;bottom:8%;color:#fff}
      .bar{width:${Math.round(W * 0.06)}px;height:${Math.round(H * 0.013)}px;background:${accent};border-radius:99px;margin-bottom:${Math.round(H * 0.028)}px}
      h1{margin:0;font-size:${Math.round(H * 0.11)}px;font-weight:800;letter-spacing:-2px;line-height:.98;text-shadow:0 6px 44px rgba(0,0,0,.55)}
      p{margin:${Math.round(H * 0.02)}px 0 0;font-size:${Math.round(H * 0.036)}px;font-weight:500;color:#e2e9f2;text-shadow:0 2px 22px rgba(0,0,0,.55)}
      .brand{position:fixed;top:5.5%;right:6%;color:#fff;font-weight:800;font-size:${Math.round(H * 0.03)}px;opacity:.9;letter-spacing:-.5px;text-shadow:0 2px 16px rgba(0,0,0,.5)}</style>
      <div class="bg"></div><div class="scrim"></div>
      <span class="brand">PiPilot</span>
      <div class="txt"><div class="bar"></div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>`
  }
  const ctx = await (await getBrowser()).newContext({ viewport: { width: W, height: H } })
  try {
    const page = await ctx.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    // Wait for the theme web font to load before capturing — otherwise the poster shows the generic
    // fallback font (same display=swap issue as the animated cards).
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))])).catch(() => {})
    // Wait for the background image (a0/URL) to actually decode before capturing (CSS bg loads lazily).
    if (bgUrl) await page.evaluate((u) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = () => r(); i.src = u; setTimeout(r, 6000) }), bgUrl).catch(() => {})
    else await page.waitForTimeout(cov.html ? 900 : 300)
    await page.screenshot({ path: thumbOut, type: 'jpeg', quality: 90 })
  } finally { await ctx.close() }
  return true
}

async function cardSeg(out, dur, html) {
  const vdir = fs.mkdtempSync(path.join(WORK, 'card-'))
  try {
    const ctx = await (await getBrowser()).newContext({ viewport: { width: W, height: H }, recordVideo: { dir: vdir, size: { width: W, height: H } } })
    const tStart = process.hrtime.bigint()
    const page = await ctx.newPage()
    // First paint downloads the theme web font.
    await page.setContent(html, { waitUntil: 'load' })
    // Wait for the font to ACTUALLY load (bounded) before we keep the take — otherwise `display=swap`
    // renders the generic fallback font for the opening frames and every card looks plain/off-brand.
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))])).catch(() => {})
    // Re-render so the CSS entrance animations restart from t=0 — the font is now cached in this
    // context, so it paints correctly from the very first frame of THIS pass (no swap flash).
    await page.setContent(html, { waitUntil: 'load' })
    const skip = Number(process.hrtime.bigint() - tStart) / 1e9  // pre-roll (font-load + warm-up) to trim off
    await page.waitForTimeout(Math.round(dur * 1000) + 150)
    await page.close(); await ctx.close()
    const webm = fs.readdirSync(vdir).find((f) => f.endsWith('.webm'))
    if (!webm) throw new Error('no .webm recorded')
    // OUTPUT seek (`-ss` after `-i`) = frame-accurate: drop the pre-roll, keep `dur`s of the clean,
    // correctly-fonted pass with its entrance animations intact.
    ff(['-i', path.join(vdir, webm), '-ss', skip.toFixed(3), '-t', `${dur}`, '-an', '-vf', NORM, ...SEG, out])
  } finally { fs.rmSync(vdir, { recursive: true, force: true }) }
}

// Overlay a resolved logo in a CORNER of an already-rendered (WxH, silent) segment — a brand tag
// on any visual scene. pos ∈ bottom-right(default)|bottom-left|top-right|top-left. Best-effort:
// leaves the segment untouched on any failure.
async function overlayLogo(seg, url, pos) {
  if (!url) return
  let png
  try { png = curl(url, path.join(CACHE, `logo_${hash(url)}.png`)) } catch { return }
  if (!png || !fs.existsSync(png)) return
  const lw = Math.round(W * 0.15), pad = Math.round(W * 0.035)
  const POS = {
    'bottom-right': `W-w-${pad}:H-h-${pad}`, 'bottom-left': `${pad}:H-h-${pad}`,
    'top-right': `W-w-${pad}:${pad}`, 'top-left': `${pad}:${pad}`,
  }
  const at = POS[String(pos || '').toLowerCase().replace(/\s+/g, '-')] || POS['bottom-right']
  const tmp = seg.replace(/\.mp4$/, '_lg.mp4')
  try {
    ff(['-i', seg, '-i', png, '-filter_complex', `[1:v]scale=${lw}:-1[lg];[0:v][lg]overlay=${at}[v]`, '-map', '[v]', ...SEG, tmp])
    fs.renameSync(tmp, seg)
  } catch { try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp) } catch { /* noop */ } }
}

// ── Talking-avatar presenter (Wav2Lip lip-sync, CPU) ─────────────────────────
const W2L_DIR = process.env.WAV2LIP_DIR || '/opt/wav2lip'
const AVATARS_DIR = process.env.AVATARS_DIR || '/opt/avatars'   // baked presenter CHARACTER library
const MATTE = path.join(import.meta.dirname, 'matte.py')         // U^2-Net background matting
const MATTE_PY = process.env.MATTE_PY || '/opt/matte-venv/bin/python'  // isolated venv (numpy 2.x, off Wav2Lip)
// Resolve the presenter portrait ONCE per render and cache it, so every {kind:"avatar"}
// scene shows the SAME face. Priority: presenter.src (a LOCKED portrait URL — pixel-
// identical across videos, for a persistent "channel avatar") → a0 from presenter.prompt
// with a FIXED seed (deterministic — a0 returns the same face on every render) → a
// default persona. Framing is tuned for face detection (frontal, centered, plain bg,
// mouth closed). Returns a local path, or null if it can't be resolved.
let _presenter // undefined until resolved; '' = resolution failed
function presenterPortrait() {
  if (_presenter !== undefined) return _presenter || null
  const p = SB.presenter && typeof SB.presenter === 'object' ? SB.presenter
    : (typeof SB.presenter === 'string' ? { prompt: SB.presenter } : {})
  try {
    // A baked CHARACTER from the library (presenter:{character:"aria"}) — a curated frontal portrait.
    if (p.character) { const f = path.join(AVATARS_DIR, `${String(p.character).toLowerCase().replace(/[^a-z0-9]+/g, '')}.jpg`); if (fs.existsSync(f)) { _presenter = f; return f } }
    if (p.src || p.image_url) { _presenter = curl(String(p.src || p.image_url), path.join(CACHE, 'presenter.jpg')); return _presenter }
    const persona = String(p.prompt || p.persona || 'a warm, professional television presenter with a friendly, approachable face')
    const framed = `${persona}. Photorealistic head-and-shoulders studio portrait, face centered and looking straight at the camera, neutral relaxed expression with the mouth gently closed, soft even studio lighting, clean plain background, sharp focus, high detail.`
    const seed = Number.isFinite(Number(p.seed)) ? Number(p.seed) : 7
    _presenter = curl(a0ImageUrl(framed, seed, '3:4'), path.join(CACHE, 'presenter.jpg'))
  } catch (e) { console.log(`   (presenter portrait failed: ${e.message})`); _presenter = '' }
  return _presenter || null
}
// The narration voice that MATCHES the presenter, so a female avatar never speaks in a male
// voice (and vice-versa). presenter.voice wins; else each baked character maps to a fitting
// Kokoro voice (am_=US male, af_=US female, bm_/bf_=British). Returns null when there's no
// presenter / unknown custom face (→ use SB.voice).
function presenterVoice() {
  const p = SB.presenter && typeof SB.presenter === 'object' ? SB.presenter : {}
  if (typeof p.voice === 'string' && p.voice) return p.voice
  const CV = {
    aria: 'af_heart', maya: 'af_jessica', zoe: 'af_sky', lily: 'bf_lily', nova: 'af_nova',
    noah: 'am_fenrir', ethan: 'am_eric', kai: 'am_liam', leo: 'bm_fable', ryan: 'bm_lewis',
  }
  const c = typeof p.character === 'string' ? p.character.toLowerCase().replace(/[^a-z0-9]+/g, '') : ''
  return CV[c] || null
}
// Wav2Lip: portrait + speech wav → lip-synced talking head (portrait-res, has audio).
// --static detects the face ONCE on the still (vs every frame) → big CPU speedup. Throws.
function wav2lip(portrait, wav, out) {
  execFileSync('python3', ['inference.py',
    '--checkpoint_path', path.join(W2L_DIR, 'checkpoints', 'wav2lip_gan.pth'),
    '--face', portrait, '--audio', wav, '--outfile', out,
    '--static', 'True', '--nosmooth', '--pads', '0', '10', '0', '0', '--resize_factor', '1'],
  { cwd: W2L_DIR, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, OMP_NUM_THREADS: '8' } })
  if (!fs.existsSync(out)) throw new Error('wav2lip produced no output')
  return out
}
// Background behind a corner presenter (full-frame WxH, silent, `dur`s): scene bg/prompt →
// a0 image (Ken Burns), else a keyword stock still, else a themed radial gradient card.
// A themed radial-gradient card (browser-only, NO network) — the universal safe fallback.
function themedGradient() {
  const th = SB.theme || {}
  const c1 = String(Array.isArray(th.bg) ? th.bg[0] : (th.bg || '#0b1020')).replace(/'/g, '')
  const c2 = String(Array.isArray(th.bg) ? (th.bg[1] || th.accent) : (th.accent || '#1b2550')).replace(/'/g, '')
  return `<style>html,body{margin:0;height:100%}body{background:radial-gradient(circle at 30% 25%, ${c2}, ${c1})}</style><body></body>`
}
async function avatarBg(out, dur, s) {
  if (s.bg && (s.bg.prompt || s.bg.src)) { kenBurnsSeg(out, s.bg.src || a0ImageUrl(s.bg.prompt, hash(String(s.bg.prompt))), dur); return }
  if (s.prompt) { kenBurnsSeg(out, a0ImageUrl(s.prompt, hash(String(s.prompt))), dur); return }
  if (s.keyword) { try { const [ph] = pickPhotos({ keyword: s.keyword, n: 1, seed: 0 }); if (ph?.url) { kenBurnsSeg(out, ph.url, dur); return } } catch { /* fall through */ } }
  await cardSeg(out, dur, themedGradient())
}
// A scene failed to resolve its asset (e.g. a0 500, dead URL, keyword matched no stock,
// no b-roll corpus) — render SOMETHING meaningful rather than crash OR flash a blank color.
// Cascade: (1) a real stock photo if a keyword exists → (2) a THEMED TEXT CARD built from
// whatever the scene says (title/heading/narration) so the viewer always sees legible content,
// not a bare gradient → (3) an empty themed gradient only when the scene truly has NO text.
function fallbackTitle(s) {
  const firstSentence = (txt) => {
    const m = String(txt || '').trim().split(/(?<=[.!?])\s+/)[0] || ''
    return m.length > 90 ? m.slice(0, 88).trim() + '…' : m
  }
  return String(s.title || s.heading || s.headline || s.text || s.label || s.caption || firstSentence(s.say) || SB.title || '').trim()
}
async function fallbackSeg(out, dur, s) {
  // 1) Real stock photo when the scene named a keyword (pickPhotos never dead-ends).
  try { const kw = s.keyword || s.q; if (kw) { const [ph] = pickPhotos({ keyword: kw, n: 1, seed: 0 }); if (ph?.url) { kenBurnsSeg(out, ph.url, dur); return 'stock-fallback' } } } catch { /* fall through */ }
  // 2) Graceful TEXT CARD — reuse the themed title-card renderer with the scene's own words,
  //    so a failed asset lookup degrades to a designed card, never a plain color.
  const title = fallbackTitle(s)
  if (title) {
    const sub = String(s.sub || s.subtitle || (s.title ? s.caption : '') || '').trim() || undefined
    try { await cardSeg(out, dur, titleCard({ ...s, title, sub }, 0)); return 'text-card-fallback' }
    catch { /* fall through to gradient */ }
  }
  // 3) Last resort: themed gradient (only when the scene carries no text at all).
  await cardSeg(out, dur, themedGradient())
  return 'gradient-fallback'
}
// Cut the presenter OUT of the (opaque) talking clip → a grayscale alpha mask. The silhouette
// is CONSTANT (Wav2Lip moves only the mouth), so one mask from frame 0 matts the whole clip.
// Returns the mask path, or null (→ composite the opaque clip as a graceful fallback).
function matteMask(talk) {
  try {
    const f0 = talk.replace(/\.mp4$/, '_f0.png'); ff(['-i', talk, '-frames:v', '1', f0])
    const mask = talk.replace(/\.mp4$/, '_mask.png')
    execFileSync(MATTE_PY, [MATTE, f0, mask], { stdio: ['ignore', 'ignore', 'inherit'] })
    return fs.existsSync(mask) ? mask : null
  } catch (e) { console.log(`   (matte failed: ${e.message}) → opaque presenter`); return null }
}

// Corner placement + LIVELY motion for a presenter overlay. Bottom corners SIT FLUSH on the
// bottom edge (y=H-h, no gap) and lift UPWARD only so the presenter stays GLUED to the edge —
// never floating. Side edges are flush too, swaying INWARD so it never leaves frame. Plus a slow
// sway and a subtle fast micro-shake for life. Returns {x,y} ffmpeg overlay expressions.
function presenterMotion(pose) {
  const p = String(pose || 'bottom-right').toLowerCase().replace(/\s+/g, '-')
  const left = p.includes('left'), top = p.includes('top')
  const swayX = Math.max(6, Math.round(W * 0.009))
  const bobY = Math.max(8, Math.round(H * 0.016))
  const jit = Math.max(2, Math.round(H * 0.0022))
  const sway = `${swayX}*sin(2*PI*t/5)`
  const shake = `${jit}*sin(2*PI*t*2.7)`             // subtle fast shake
  const bob = `${bobY}*(0.5-0.5*cos(2*PI*t/3.2))`    // 0..bobY, smooth (lift up from the edge)
  const x = left ? `abs(${sway})+(${shake})` : `W-w-abs(${sway})-(${shake})`
  const y = top ? `abs(${bob})+(${shake})` : `H-h-(${bob})+(${shake})`
  return { x, y }
}
// avatar scene → a talking presenter, MATTED (transparent cutout) and composited over a
// background — corner cutaway (default, sitting flush on the edge) or full-frame — with LIVELY
// motion (sway + up-bob + micro-shake; the bg's own Ken Burns pan behind it adds parallax).
async function avatarSeg(out, dur, s, wav) {
  const portrait = presenterPortrait()
  if (!portrait) { await avatarBg(out, dur, s); return }          // no face → just the background
  if (!wav) { kenBurnsSeg(out, portrait, dur); return }           // no narration → a still portrait
  const talk = path.join(WORK, `talk_${String(hash(out))}.mp4`)
  try { wav2lip(portrait, wav, talk) }
  catch (e) { console.log(`   (wav2lip failed: ${e.message}) → still portrait`); kenBurnsSeg(out, portrait, dur); return }
  const mask = matteMask(talk)                                    // transparent cutout (null = opaque)
  const bg = path.join(WORK, `abg_${String(hash(out))}.mp4`)
  await avatarBg(bg, dur, s)                                      // always over a background now
  const pose = String(s.pose || s.position || 'corner').toLowerCase().replace(/\s+/g, '-')
  let th, x, y
  if (pose === 'full') {
    th = Math.round((H * 0.98) / 2) * 2
    const sx = Math.max(4, Math.round(W * 0.005)), sy = Math.max(4, Math.round(H * 0.008))
    x = `(W-w)/2+${sx}*sin(2*PI*t/6)`; y = `(H-h)/2+${sy}*sin(2*PI*t/4.4)`
  } else {
    const sz = Number(s.size); const frac = sz > 0.2 && sz < 0.9 ? sz : 0.46
    th = Math.round((H * frac) / 2) * 2
    const m = presenterMotion(pose); x = m.x; y = m.y
  }
  const ov = `overlay=x=${x}:y=${y}:eof_action=repeat,fps=${FPS},format=yuv420p`
  if (mask) {
    ff(['-i', bg, '-i', talk, '-loop', '1', '-i', mask, '-filter_complex',
      `[1:v]scale=-2:${th}[p];[2:v]scale=-2:${th},format=gray[m];[p][m]alphamerge[pa];[0:v][pa]${ov}[v]`,
      '-map', '[v]', '-t', `${dur}`, '-an', ...SEG, out])
  } else {
    ff(['-i', bg, '-i', talk, '-filter_complex', `[1:v]scale=-2:${th}[p];[0:v][p]${ov}[v]`, '-map', '[v]', '-t', `${dur}`, '-an', ...SEG, out])
  }
}

// A STATIC matted cutout of the presenter (portrait matted ONCE → RGBA png), for a persistent
// host presence on NON-avatar scenes — the presenter is "there" the whole video without paying
// Wav2Lip per scene. Cached. Returns the cutout png path or null.
let _presenterStill // undefined until resolved; '' = failed
function presenterStill() {
  if (_presenterStill !== undefined) return _presenterStill || null
  const portrait = presenterPortrait()
  if (!portrait) { _presenterStill = ''; return null }
  try {
    const mask = path.join(WORK, 'presenter_still_mask.png')
    execFileSync(MATTE_PY, [MATTE, portrait, mask], { stdio: ['ignore', 'ignore', 'inherit'] })
    const rgba = path.join(WORK, 'presenter_still.png')
    ff(['-i', portrait, '-i', mask, '-filter_complex', '[0:v][1:v]alphamerge[o]', '-map', '[o]', rgba])
    _presenterStill = fs.existsSync(rgba) ? rgba : ''
  } catch (e) { console.log(`   (presenter still failed: ${e.message})`); _presenterStill = '' }
  return _presenterStill || null
}
// Overlay the static presenter cutout onto an already-built (WxH, silent) segment, corner-placed
// with the same gentle sway/bob as the talking version so it reads as a live host, not a sticker.
async function overlayPresenterStill(seg, dur, pos, size) {
  const cut = presenterStill(); if (!cut) return
  const frac = Number(size) > 0.2 && Number(size) < 0.9 ? Number(size) : 0.4
  const th = Math.round((H * frac) / 2) * 2
  const { x, y } = presenterMotion(pos)   // flush to the edge, sway + up-bob + micro-shake
  const tmp = seg.replace(/\.mp4$/, '_pr.mp4')
  try {
    ff(['-i', seg, '-loop', '1', '-i', cut, '-filter_complex', `[1:v]scale=-2:${th}[p];[0:v][p]overlay=x=${x}:y=${y}:eof_action=repeat,format=yuv420p[v]`, '-map', '[v]', '-t', `${dur}`, ...SEG, tmp])
    fs.renameSync(tmp, seg)
  } catch (e) { console.log(`   (presenter overlay skipped: ${e.message})`); try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp) } catch { /* noop */ } }
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
// A clean LOGO card — the brand logo centered + contained (never cropped) on the theme
// background, with an optional caption. Used for {kind:"image"|"still", brand:"…"} scenes.
function logoCard(scene, url) {
  const t = resolveTheme(scene)
  const f = fontFor(t.font)
  const solid = Array.isArray(t.bg) ? t.bg[0] : (typeof t.bg === 'string' && !/gradient\(/.test(t.bg) ? t.bg : '#0E1726')
  const bg = Array.isArray(t.bg) ? `linear-gradient(135deg,${t.bg[0]},${t.bg[1] || t.bg[0]})` : (t.bg || solid)
  const cap = scene.title || scene.caption || scene.sub || ''
  return `${f.link}<style>*{margin:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden}</style>
  <div style="width:100vw;height:100vh;display:flex;flex-direction:column;gap:4vh;align-items:center;justify-content:center;background:${esc(bg)};font-family:${f.face}">
    <img src="${esc(url)}" crossorigin="anonymous" style="max-width:62%;max-height:${cap ? '52%' : '66%'};object-fit:contain;filter:drop-shadow(0 10px 34px rgba(0,0,0,.35));animation:lpop .8s ease both"/>
    ${cap ? `<div style="color:${esc(t.text)};font-size:4.4vh;font-weight:800;letter-spacing:-.01em;text-align:center;animation:lrise .8s .15s ease both">${esc(String(cap))}</div>` : ''}
  </div>
  <style>@keyframes lpop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}@keyframes lrise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}</style>`
}

function canvasHtml(scene) {
  const t = resolveTheme(scene)
  const f = fontFor(t.font)
  const solid = Array.isArray(t.bg) ? t.bg[0] : (typeof t.bg === 'string' && !/gradient\(/.test(t.bg) ? t.bg : '#0E1726')
  // A brand/company logo the canvas HTML can place anywhere via var(--logo) (e.g.
  // background:var(--logo) center/contain no-repeat, or <img src> can't read a var so use bg-image).
  // scene.logo = an explicit URL; scene.brand = a brand name resolved to its official logo.
  const logoUrl = scene.logo ? String(scene.logo).replace(/'/g, '') : (scene.brand ? brandLogo(scene.brand) : null)
  const vars = `--bg:${esc(solid)};--bg2:${esc(t.bg2 || solid)};--accent:${esc(t.accent)};--text:${esc(t.text)};--sub:${esc(t.sub)};--font:${f.face}${logoUrl ? `;--logo:url('${logoUrl}')` : ''}`
  // Optional `bg` = a TEXTLESS image behind the scene, so the agent overlays PERFECT HTML text on
  // top of an AI-generated (or provided) picture — the right way to do "image with text".
  //   bg: { prompt } (a0 textless image) | { src } (URL) | "prompt string" ; scrim:false to skip the scrim.
  let bgLayer = ''
  if (scene.bg) {
    const b = scene.bg
    const url = typeof b === 'string' ? a0ImageUrl(b, 0)
      : String(b.src || b.image_url || (b.prompt ? a0ImageUrl(b.prompt, hash(String(b.prompt))) : '')).replace(/'/g, '')
    if (url) {
      bgLayer = `<div style="position:fixed;inset:0;z-index:0;background:#0a0c12 url('${url}') center/cover no-repeat"></div>`
      if (scene.scrim !== false) bgLayer += `<div style="position:fixed;inset:0;z-index:0;background:linear-gradient(180deg,rgba(8,10,16,.18) 0%,rgba(8,10,16,.55) 100%)"></div>`
    }
  }
  const body = (bgLayer ? `<div style="position:relative;z-index:1;width:100%;height:100%">` : '')
    + (String(scene.html || scene.canvas || '').trim()
      || `<div style="position:fixed;inset:0;display:grid;place-items:center;color:var(--text);font-family:var(--font)">canvas</div>`)
    + (bgLayer ? '</div>' : '')
  // Base font-size scales with canvas height so the agent can size with `em`. KF gives it the
  // built-in g/r/f keyframes (bar-grow / rise-in / fade-in) to reuse alongside its own @keyframes.
  return `${f.link}<style>
    :root{${vars}}
    *{box-sizing:border-box}
    html,body{margin:0;width:100%;height:100%;overflow:hidden}
    body{background:${bgFor(t)};color:var(--text);font-family:var(--font);font-size:${Math.round(H / 40)}px;line-height:1.4}
    ${KF}
  </style>${bgLayer}${body}`
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
  // ── AUDIO-ONLY PODCAST ──────────────────────────────────────────────────────
  // A multi-voice podcast / voiceover: each `turn` is a spoken line
  // ({ speaker, text, voice? }), synthesized in its own Kokoro voice and sequenced
  // back-to-back with a natural gap, over an OPTIONAL music bed that swells at the
  // open/close and DUCKS under the dialogue (per-frame volume expression). No video
  // is rendered and the browser never opens — output is out/podcast.mp3 (+ a cover).
  // Shape: { audioOnly:true | kind:'podcast', title?, music?, voices?:{Name:voiceId},
  //          gap?, introLead?, outroTail?, musicVolume?, turns:[{speaker,text,voice?,gap?}] }
  if (SB.audioOnly === true || SB.kind === 'podcast') {
    const voiceMap = (SB.voices && typeof SB.voices === 'object') ? SB.voices : {}
    const rawTurns = Array.isArray(SB.turns) ? SB.turns
      : Array.isArray(SB.dialogue) ? SB.dialogue
      : Array.isArray(SB.scenes) ? SB.scenes.map((s) => ({ speaker: s.speaker, text: s.say || s.text, voice: s.voice, gap: s.gap }))
      : []
    const turns = rawTurns
      .map((t) => ({ speaker: t.speaker || '', text: String(t.text || t.say || '').trim(),
        voice: t.voice || voiceMap[t.speaker] || SB.voice, gap: (t.gap != null && isFinite(+t.gap)) ? +t.gap : null }))
      .filter((t) => t.text)
    if (!turns.length) { console.error('podcast: no spoken turns'); process.exit(2) }
    console.log(`▶  podcast · ${turns.length} turns · voices: ${[...new Set(turns.map((t) => t.voice || DEFAULT_VOICE))].join(', ')}\n`)

    const GAP = Math.max(0, Math.min(3, Number(SB.gap ?? 0.35) || 0.35))
    const hasMusic = !!(SB.music && (SB.music.url || SB.music.mood))
    const LEAD = Math.max(0, Math.min(8, Number(SB.introLead ?? (hasMusic ? 2.2 : 0))))
    const TAIL = Math.max(0, Math.min(8, Number(SB.outroTail ?? (hasMusic ? 2.5 : 0.4))))
    const lines = []
    let cursor = LEAD
    for (let i = 0; i < turns.length; i++) {
      const t = turns[i]
      const wav = tts(t.text, t.voice, path.join(WORK, `pod_${i}.wav`))
      if (!wav) { console.log(`   (turn ${i} tts failed — skipped)`); continue }
      const gap = t.gap == null ? GAP : Math.max(0, Math.min(3, t.gap))
      lines.push({ start: cursor, dur: wav.dur, wav: wav.wav })
      console.log(`   · ${t.speaker || 'voice'} (${t.voice || DEFAULT_VOICE}) — ${wav.dur.toFixed(1)}s @ ${cursor.toFixed(1)}s`)
      cursor += wav.dur + gap
    }
    if (!lines.length) { console.error('podcast: all turns failed to synthesize'); process.exit(2) }
    const dialogueEnd = cursor - GAP
    const total = dialogueEnd + TAIL

    // Resolve an optional music bed (inline — resolveTrack lives later in this IIFE).
    let track = null
    if (SB.music) {
      if (SB.music.url) track = { url: SB.music.url }
      else if (SB.music.mood) { try { const p = pickMusic({ mood: SB.music.mood, seed: (Date.now() >>> 0) }); track = { url: p.url } } catch { track = null } }
    }
    const inputs = [], aParts = [], mixLabels = []
    let idx = 0
    if (track) {
      const music = curl(track.url, path.join(CACHE, `music_${hash(track.url)}.mp3`))
      inputs.push('-stream_loop', '-1', '-i', music); const mi = idx++
      const full = Math.max(0, Math.min(1, Number(SB.musicIntroVolume ?? 0.8)))
      const duck = Math.max(0, Math.min(1, Number(SB.musicVolume ?? 0.12)))
      const fOut = Math.min(2.0, TAIL || 1.2)
      // Music plays clear during the intro lead + outro tail, ducks under [LEAD, dialogueEnd].
      aParts.push(`[${mi}:a]atrim=0:${total.toFixed(2)},afade=t=in:st=0:d=${Math.min(1.5, LEAD || 1).toFixed(2)},afade=t=out:st=${(total - fOut).toFixed(2)}:d=${fOut.toFixed(2)},volume=eval=frame:volume='if(between(t,${LEAD.toFixed(2)},${dialogueEnd.toFixed(2)}),${duck},${full})'[bed]`)
      mixLabels.push('[bed]')
    }
    const lineIdx = []
    for (const l of lines) { inputs.push('-i', l.wav); lineIdx.push(idx++) }
    lines.forEach((l, k) => {
      const ms = Math.round(l.start * 1000)
      aParts.push(`[${lineIdx[k]}:a]adelay=${ms}|${ms},volume=1.35[v${k}]`)
      mixLabels.push(`[v${k}]`)
    })
    aParts.push(mixLabels.length === 1 ? `${mixLabels[0]}anull[a]`
      : `${mixLabels.join('')}amix=inputs=${mixLabels.length}:normalize=0:duration=longest[a]`)

    const outPod = path.join(OUT, 'podcast.mp3')
    const fcFile = path.join(WORK, 'podgraph.txt'); fs.writeFileSync(fcFile, aParts.join(';'))
    ff([...inputs, '-filter_complex_script', fcFile, '-map', '[a]', '-c:a', 'libmp3lame', '-q:a', '3', '-t', total.toFixed(2), outPod])

    // Cover art so the hub/playground has a poster (a0 background, else a default studio prompt).
    try {
      const cp = (SB.cover && (SB.cover.prompt || (typeof SB.cover === 'string' ? SB.cover : SB.cover.src)))
        || `podcast cover art, ${SB.title || 'audio episode'}, moody studio microphone, cinematic lighting, no text`
      const cov = /^https?:\/\//.test(cp) ? curl(cp, path.join(WORK, 'cover.jpg')) : curl(a0ImageUrl(cp, 7), path.join(WORK, 'cover.jpg'))
      if (cov && fs.existsSync(cov)) { fs.copyFileSync(cov, path.join(OUT, 'thumb.jpg')); console.log('   cover: out/thumb.jpg') }
    } catch (e) { console.log(`   (cover skipped: ${e.message})`) }

    const mb = (fs.statSync(outPod).size / 1048576).toFixed(2)
    console.log(`\n✅ out/podcast.mp3 · ${total.toFixed(1)}s · ${mb} MB`)
    console.log(`⏱  ${secs().toFixed(1)}s`)
    return
  }
  // ── end podcast ──────────────────────────────────────────────────────────────

  const nSay = SB.scenes.filter((s) => s.say).length
  console.log(`▶  ${W}x${H}@${FPS} · ${SB.scenes.length} scenes${nSay ? ` · ${nSay} narrated${CAPTIONS ? '+captions' : ''}` : ''}${DRAFT ? ' · DRAFT' : ''}${WM ? ' · watermark' : ''}\n`)
  const credits = [], segs = []
  let hasOutro = false
  // Resolve music up front — the credits card needs its attribution string.
  // A scene may carry its OWN `music` ({mood}|{url}|null) to SWITCH the track; scenes without one
  // inherit the top-level SB.music. Contiguous scenes sharing a track become ONE looped segment,
  // and the track crossfades when a scene selects a different one. (One SB.music → one segment.)
  // A per-render seed so two videos with the SAME mood don't get the identical track every time
  // (pickMusic is deterministic per seed; without a varied seed every "epic" video reused one clip).
  const musicSeed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0
  const resolveTrack = (m, seed) => {
    if (!m) return null
    if (m.url) return { url: m.url, credit: m.credit || 'music' }
    if (m.mood) { try { const p = pickMusic({ mood: m.mood, seed }); return { url: p.url, credit: p.credit } } catch { return null } }
    return null
  }
  // Resolve the top-level track ONCE (shared seed) so every inheriting scene reuses the SAME clip
  // and contiguous scenes still merge into one looped segment. Per-scene overrides get their own seed.
  const _topTrack = resolveTrack(SB.music, musicSeed)
  const _sceneMusic = SB.scenes.map((s, i) => (
    Object.prototype.hasOwnProperty.call(s, 'music') ? resolveTrack(s.music, musicSeed + i + 1) : _topTrack))
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
  // A defined presenter IS the narrator, so its matching voice becomes the video's default —
  // overriding a mismatched top-level SB.voice (why a female avatar was speaking in a male voice).
  const DEFAULT_NARR_VOICE = presenterVoice() || SB.voice
  const narrRaw = []
  for (let i = 0; i < SB.scenes.length; i++) {
    const s = SB.scenes[i]
    const hasTurns = Array.isArray(s.turns) && s.turns.some((t) => t && (t.text || t.say))
    if (!s.say && !hasTurns) { narrRaw.push(null); continue }
    const v = s.voice || DEFAULT_NARR_VOICE
    const w = hasTurns
      ? ttsDialog(s.turns, v, path.join(WORK, `narr_${i}.wav`))
      : tts(s.say, v, path.join(WORK, `narr_${i}.wav`))
    narrRaw.push(w || null)
    // keepAudio scenes hold their EXACT clip length (the transcript range) — the `say` is only a
    // short VO patch over part of it, so DON'T stretch the scene to fit the narration.
    if (w) { if (!s.keepAudio) durs[i] = Math.max(durs[i], w.dur + 0.6); console.log(`   · narration ${i} (${v || DEFAULT_VOICE}) — ${w.dur.toFixed(1)}s${s.keepAudio ? ' [patch over kept audio]' : ''}`) }
  }
  const starts = []; { let a = 0; for (let i = 0; i < durs.length; i++) { starts.push(a); a += durs[i] - (i < durs.length - 1 ? XF : 0) } }
  const narr = []
  for (let i = 0; i < narrRaw.length; i++) {
    const w = narrRaw[i]; if (!w) continue
    const s = SB.scenes[i]
    // VO patch position: default at the scene start; `sayAt:"end"` places it at the tail so the
    // original clip audio leads and the narrator closes the beat. Only meaningful with keepAudio.
    const winMax = Math.max(0.1, durs[i] - 0.2)
    const voLen = Math.min(w.dur, winMax)
    const atEnd = s.keepAudio && (s.sayAt === 'end' || s.sayAt === 'outro')
    const rel = atEnd ? Math.max(0, durs[i] - voLen - 0.3) : 0
    narr.push({ i, start: starts[i] + rel, rel, dur: w.dur, voLen, wav: w.wav, text: s.say || "", end: starts[i] + durs[i] })
  }
  const narrByScene = new Map(narr.map((n) => [n.i, n]))
  const hasNarr = narr.length > 0
  // Per-scene ORIGINAL clip audio (only for keepAudio scenes) → { wav } keyed by scene index.
  // Mixed into the final track at the scene's offset, ducked under any VO patch on that scene.
  const clipAudio = new Map()
  try {
    for (let i = 0; i < SB.scenes.length; i++) {
      const s = SB.scenes[i]
      const out = path.join(WORK, `seg_${String(i).padStart(2, '0')}.mp4`)
      const dur = durs[i]
      const cBefore = credits.length // to report each scene's resolved asset source in the log
      try {
      if (s.kind === 'title') {
        // Typewriter cards sync their type duration to the narration when present.
        await cardSeg(out, dur, titleCard(s, s.typewriter ? (narrByScene.get(i)?.dur || dur * 0.7) : 0))
      } else if (s.kind === 'video') {
        // Resolution order: ytClip (real YouTube footage, resolved in-sandbox + trimmed to start/dur)
        // → user src → LIVE Pixabay/Pexels (on-topic) → baked corpus B-roll → a0 image. Each step
        // falls through to the next on failure so a scene NEVER renders black.
        const clipId = typeof s.ytClip === 'string' && /^[A-Za-z0-9_-]{11}$/.test(s.ytClip) ? s.ytClip : null
        const userSrc = s.src || s.image_url || s.asset
        const vkw = s.keyword || s.q || s.prompt || ''
        let done = false
        if (clipId) {
          // Retry with a FRESH tunnel URL each attempt: cobalt occasionally hands back a partial/
          // still-transcoding file (curl gets 200 but the mp4 has no moov atom → ffmpeg errors), and
          // a re-mint almost always fixes it. brollSeg downloads + trims (-ss/-t) + loop-fills.
          let usedUrl = null
          for (let attempt = 0; attempt < 3 && !done; attempt++) {
            const clipUrl = resolveYtClip(clipId, s.quality || 480)
            if (!clipUrl) { console.log(`   (ytClip ${clipId} resolve miss, attempt ${attempt + 1})`); continue }
            try { brollSeg(out, clipUrl, dur, s.start || 0); credits.push('YouTube clip'); done = true; usedUrl = clipUrl }
            catch (e) { console.log(`   (ytClip ${clipId} attempt ${attempt + 1} failed: ${e.message})`) }
          }
          if (!done) console.log(`   (ytClip ${clipId} → fallback after retries)`)
          // keepAudio → extract the clip's ORIGINAL audio (same trim/loop as the video) so it can play
          // under/after any VO patch. Reuses brollSeg's already-downloaded mp4; skipped if the clip
          // has no audio track. Failure is non-fatal (scene just stays silent b-roll).
          if (done && usedUrl && s.keepAudio) {
            try {
              const src = path.join(CACHE, `vid_${hash(usedUrl)}.mp4`)
              const aout = path.join(WORK, `clipaud_${i}.wav`)
              const pre = (s.start || 0) > 0 ? ['-ss', `${s.start}`] : []
              execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-stream_loop', '-1', ...pre, '-i', src, '-t', `${dur}`, '-vn', '-ac', '2', '-ar', '44100', aout], { stdio: ['ignore', 'ignore', 'inherit'] })
              if (fs.existsSync(aout) && fs.statSync(aout).size > 2000) { clipAudio.set(i, { wav: aout }); console.log(`   · kept original audio for scene ${i}`) }
              else console.log(`   (scene ${i} keepAudio: clip had no usable audio track)`)
            } catch (e) { console.log(`   (scene ${i} keepAudio extract failed: ${e.message})`) }
          }
        }
        if (!done && userSrc) { credits.push('provided'); kenBurnsSeg(out, userSrc, dur, s.forward !== false); done = true }
        if (!done) { const live = liveVideo(vkw); if (live) { credits.push(live.credit); brollSeg(out, live.url, dur, s.start || 0); done = true } }
        if (!done) { const clip = pickVideo({ keyword: vkw, aspect: SB.aspect, minDur: s.dur, seed: i }); if (clip) { credits.push(clip.credit); brollSeg(out, clip.url_medium || clip.url, dur, s.start || 0); done = true } }
        if (!done) { credits.push('AI-generated (a0)'); kenBurnsSeg(out, a0ImageUrl(s.prompt || s.q || 'cinematic abstract background', i), dur, s.forward !== false) }
      } else if (s.kind === 'still' || s.kind === 'image') {
        // Resolution priority: a brand logo ({brand:"…"} → official logo, contained on a card) →
        // a user-supplied asset URL (their logo / company photos) → a bespoke a0-generated image
        // (from `prompt`) → the baked stock corpus.
        const userSrc = s.src || s.image_url || s.asset
        const brandUrl = s.brand ? brandLogo(s.brand) : null
        if (brandUrl && !userSrc) {
          // Attribute logo.dev when it served the logo (free-tier requirement); baked logos need none.
          credits.push(/img\.logo\.dev/.test(brandUrl) ? 'Logo.dev' : 'brand logo')
          await cardSeg(out, dur, logoCard(s, brandUrl))
        } else if (userSrc) {
          credits.push('provided')
          kenBurnsSeg(out, userSrc, dur, s.forward !== false)
        } else if (s.prompt) {
          const wantText = s.text === true || s.baked === true
          credits.push(wantText ? 'AI-generated (grok)' : 'AI-generated (a0)')
          kenBurnsSeg(out, genImageUrls(s.prompt, (s.pick || 0) + i, s.aspect, wantText), dur, s.forward !== false)
        } else {
          // Accuracy-first for a plain keyword: try LIVE Pixabay/Pexels BEFORE the generic baked
          // corpus so the photo actually matches the subject. Unsplash SELECTORS (id/topic/
          // collection) are corpus-specific, so those resolve from the baked pool first.
          const hasSelector = s.id || s.topic || s.collection
          const kw = s.keyword || s.topic || s.q || ''
          let resolved = false
          if (!hasSelector) {
            const live = livePhoto(kw)
            if (live) { credits.push(live.credit); kenBurnsSeg(out, live.url, dur, s.forward !== false); resolved = true }
          }
          if (!resolved) {
            const src = s.id ? { id: s.id } : s.topic ? { topic: s.topic } : s.collection ? { collection: s.collection } : { keyword: s.keyword }
            const [photo] = pickPhotos({ ...src, color: s.color, orientation: s.orientation, n: 1, seed: (s.pick || 0) + i })
            if (photo?.url) { credits.push(photo.credit); kenBurnsSeg(out, photo.url, dur, s.forward !== false); resolved = true }
          }
          if (!resolved) {
            // Selector missed (or no live match) → live keyword search, else a0-generated.
            const live = hasSelector ? livePhoto(kw) : null
            if (live) { credits.push(live.credit); kenBurnsSeg(out, live.url, dur, s.forward !== false) }
            else { credits.push('AI-generated (a0)'); kenBurnsSeg(out, a0ImageUrl(kw || 'cinematic abstract background', (s.pick || 0) + i), dur, s.forward !== false) }
          }
        }
      } else if (s.kind === 'card') {
        // Pre-designed template card — agent passes {template, data}; the engine renders a
        // professionally-typeset, animated card (distinct display font per template, theme-aware).
        await cardSeg(out, dur, cardHtml(s, resolveTheme(s), { W, H }))
      } else if (s.kind === 'canvas') {
        // Agent-handcrafted HTML scene (perfect text, custom layout, CSS animation).
        await cardSeg(out, dur, canvasHtml(s))
      } else if (s.kind === 'design') {
        // Agent-handcrafted PYTHON design (the Design API → crisp PNG, then Ken-Burns). Best for
        // typographic/geometric/gradient/soft-minimal/poster graphics — perfect text, no browser.
        designSeg(out, s.code || s.design || '', dur, s.forward !== false)
        credits.push('code-composed design')
      } else if (s.kind === 'scene3d') {
        // Agent-handcrafted Three.js 3D scene (real WebGL via Chromium/SwiftShader, RECORDED for dur
        // so it can animate). Perfect for 3D product shots, abstract/geometric 3D, studio scenes.
        await scene3dSeg(out, s, dur)
        credits.push('3D render (Three.js)')
      } else if (s.kind === 'screencast') {
        await screencastSeg(out, s.url, s.steps, s.dur || 12, s.script)
      } else if (s.kind === 'avatar') {
        // A lip-synced talking PRESENTER (a0 portrait + this scene's Piper narration via Wav2Lip),
        // composited as a corner cutaway over a background, or full-frame (pose:"full").
        await avatarSeg(out, dur, s, narrByScene.get(i)?.wav)
        credits.push(SB.presenter && (SB.presenter.src || SB.presenter.image_url) ? 'presenter' : 'AI-generated (a0)')
      } else { // credits (only rendered when the storyboard explicitly includes a credits scene)
        await cardSeg(out, dur, creditsCard([...new Set([...credits, musicCredit].filter(Boolean))], s))
      }
      } catch (err) {
        // One scene's asset failed (a0 500, dead URL, bad keyword…) — NEVER let it crash the whole
        // render. Log it and drop in a graceful fallback so the video still completes.
        console.log(`   (seg ${i} [${s.kind}] failed: ${err?.message ?? err}) → fallback`)
        await fallbackSeg(out, dur, s)
      }
      // Optional corner LOGO overlay (brand tag) on any visual scene — resolves a brand name to its
      // official logo (or takes a direct URL). Not applied to cards/canvas (they compose logos themselves).
      if (s.logo && (s.kind === 'video' || s.kind === 'still' || s.kind === 'image')) {
        const lu = /^https?:\/\//i.test(s.logo) ? s.logo : brandLogo(s.logo)
        if (lu) { await overlayLogo(out, lu, s.logoPos); if (/img\.logo\.dev/.test(lu)) credits.push('Logo.dev') }
      }
      // Persistent HOST: with presenter.persist set, overlay the STATIC matted presenter (no Wav2Lip)
      // as a corner bug on non-avatar visual scenes, so the host is present the WHOLE video cheaply.
      // Per-scene opt-out with `presenter:false` on the scene.
      if (SB.presenter && SB.presenter.persist === true && s.presenter !== false &&
          (s.kind === 'video' || s.kind === 'still' || s.kind === 'image' || s.kind === 'canvas')) {
        await overlayPresenterStill(out, dur, s.presenterPos || SB.presenter.corner, s.presenterSize || SB.presenter.size)
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
  // Original clip audio inputs (keepAudio scenes), in scene order.
  const clipAud = [...clipAudio.entries()].map(([i, a]) => ({ i, wav: a.wav }))
  const clipAudIdx = []
  for (const c of clipAud) { inputs.push('-i', c.wav); clipAudIdx.push(idx++) }

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
    } else if (CAPTIONS && s.say) { const n = narrByScene.get(i); const cs = n?.start ?? starts[i]; overlays.push({ text: s.say, typewriter: true, start: cs, end: Math.min(starts[i] + durs[i], cs + (n?.dur || durs[i]) + 0.4) }) }
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
  narr.forEach((n, k) => {
    const ms = Math.round(n.start * 1000)
    // On keepAudio scenes the VO is a PATCH — cap it to its window so it can't bleed past the clip.
    const trim = clipAudio.has(n.i) ? `atrim=0:${Math.max(0.1, n.voLen).toFixed(2)},asetpts=PTS-STARTPTS,` : ''
    aParts.push(`[${narrIdx[k]}:a]${trim}adelay=${ms}|${ms},volume=1.35[nd${k}]`)
    mixLabels.push(`[nd${k}]`)
  })
  // Original clip audio (keepAudio) — full level, DUCKED only under this scene's VO patch window, so
  // the narrator leads for a few seconds then RELEASES to the real audio (or plays untouched if no
  // say). Built by splitting into [duck window] + [full window] and concatenating, then delayed to
  // the scene offset. `clipVol` (default 1.0) and `duckVol` (default 0.14) are per-scene knobs.
  clipAud.forEach((c, k) => {
    const s = SB.scenes[c.i]
    const inLbl = `${clipAudIdx[k]}:a`
    const base = Math.max(0, Math.min(1.5, s.clipVol == null ? 1.0 : Number(s.clipVol)))
    const duck = Math.max(0, Math.min(1, s.duckVol == null ? 0.14 : Number(s.duckVol)))
    const ms = Math.round((starts[c.i] || 0) * 1000)
    const n = narrByScene.get(c.i)
    let chain
    if (n && n.voLen > 0.1) {
      const rel = Math.max(0, n.rel || 0)           // VO offset within the scene
      const vEnd = Math.min(durs[c.i], rel + n.voLen + 0.3)
      // window A = [0,rel) full · window B = [rel,vEnd) ducked · window C = [vEnd,dur) full — split the
      // input into the present windows, gain each, then concat back in order.
      const bounds = [[0, rel, base], [rel, vEnd, duck * base], [vEnd, durs[c.i], base]].filter(([a, b]) => b - a >= 0.05)
      const labs = []
      aParts.push(`[${inLbl}]asplit=${bounds.length}${bounds.map((_, j) => `[cas${k}_${j}]`).join('')}`)
      bounds.forEach(([a, b, g], j) => { const l = `ca${k}_${j}`; aParts.push(`[cas${k}_${j}]atrim=${a.toFixed(2)}:${b.toFixed(2)},asetpts=PTS-STARTPTS,volume=${g.toFixed(2)}[${l}]`); labs.push(`[${l}]`) })
      aParts.push(`${labs.join('')}concat=n=${labs.length}:v=0:a=1,aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}|${ms}[cad${k}]`)
    } else {
      aParts.push(`[${inLbl}]volume=${base.toFixed(2)},aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}|${ms}[cad${k}]`)
    }
    mixLabels.push(`[cad${k}]`)
  })
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

  // Thumbnail: a UNIQUE cover/poster when the storyboard specifies `cover` (a bespoke a0 background +
  // the title overlaid); otherwise fall back to a crisp frame from the opening title card.
  try {
    const thumbOut = path.join(OUT, 'thumb.jpg')
    let made = false
    try { made = await makeCover(thumbOut) } catch (e) { console.log(`   (cover render failed, using frame: ${e.message})`) }
    if (!made) {
      const at = Math.min(1.4, Math.max(0.3, total * 0.12))
      ff(['-ss', at.toFixed(2), '-i', finalOut, '-frames:v', '1', '-q:v', '3', '-vf', `scale=${W}:${H}`, thumbOut])
    }
    if (fs.existsSync(thumbOut)) console.log(`   thumb: ${path.relative(process.cwd(), thumbOut)}${made ? ' (unique cover)' : ''}`)
  } catch (e) { console.log(`   (thumb skipped: ${e.message})`) }

  const mb = (fs.statSync(finalOut).size / 1048576).toFixed(2)
  console.log(`\n✅ ${path.relative(process.cwd(), finalOut)} · ${total.toFixed(1)}s · ${mb} MB`)
  console.log(`   sources: ${[...new Set([...credits, musicCredit].filter(Boolean))].join(' · ')}`)
  console.log(`⏱  ${secs().toFixed(1)}s`)
})()
