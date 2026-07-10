// ────────────────────────────────────────────────────────────────────────
// storyboard.mjs — the STORYBOARD contract: schema doc + validator.
//
// The agent's ONLY job for a video is to emit a storyboard object that passes
// validateStoryboard(). generate.mjs consumes it; the validator gates it BEFORE
// a render is spent, returning actionable errors the agent can fix.
//
//   const { ok, errors } = validateStoryboard(sb)
//   if (!ok) return errors.join('\n')   // hand back to the model, don't render
//
// SHAPE
// {
//   title?: string,
//   width?:  number = 1280,   height?: number = 720,   fps?: number = 30,
//   aspect?: '16:9' | '9:16' | '1:1' | '4:5',   // convenience → sets width/height
//   theme?:  { style?: 'spotlight'|'bold'|'gradient'|'minimal'|'editorial',
//             bg?: hex | [hex,hex], bg2?: hex, accent?: hex, text?: hex, sub?: hex,
//             font?: 'sans'|'serif'|'mono' | '<Google Fonts family>' },  // per-VIDEO card design
//   cover?:  { prompt: string }   // a0 generates a TEXTLESS cinematic background; the video title is
//          | { src: string }       //   overlaid in the theme font → a UNIQUE poster/thumbnail
//          | { html: string }      // a fully custom cover (canvas HTML)
//          | string,               // shorthand for { prompt }
//   presenter?: { prompt: string, seed?: number }  // a talking-AVATAR face (a0-generated) reused across
//             | { src: string }                      //   every {kind:'avatar'} scene; `seed` locks the same
//             | string,                              //   face across renders; `src` = a locked portrait URL
//   voice?:    string,          // default Piper TTS voice for scene `say` narration
//   captions?: boolean,         // burn narration text as subtitles
//   transition_duration?: number,  // crossfade seconds between scenes (default 0.6, max 2.5)
//   music?:  { mood: string, minDur?: number }   // resolved via stockdb (Jamendo)
//          | { url: string, credit?: string }     // explicit track
//          | null,
//   scenes:  Scene[]   // >= 1
// }
//
// Scene kinds:
//   { kind:'title',     dur, title, sub?, style?, typewriter? }   // typewriter: type the title out
//   ANY scene also supports: say (narration text), voice (override), caption (burned text
//     overlay — a string, or { text, typewriter?:true } to TYPE it on-screen char-by-char),
//     transition (the xfade INTO this scene).  A narrated scene AUTO-EXTENDS to fit its
//     voiceover, so `say` never bleeds across the cut.  credits are OPTIONAL.
//   { kind:'video',     dur, src | keyword | q | prompt, pick?, start? }  // `src` = YOUR image/video URL; else Pixabay B-roll from the baked corpus (`keyword`|`q`); else a0 image (from `prompt`)
//   { kind:'image',     dur, brand | src | prompt, forward? }        // `brand` = official brand logo (e.g. "coca cola","pipilot") contained on a card; `src` = YOUR image URL; else bespoke a0.dev image (NO text in image)
//   { kind:'still',     dur, brand | src | prompt | keyword|topic|collection|id, pick?, color?, orientation?, forward? }  // `brand` = brand logo; `src` = YOUR image URL; else a0 `prompt`; else stock (keyword searches Pixabay+Pexels+Unsplash — include the BRAND NAME in the keyword for brand product shots, e.g. "coca cola bottle ice")
//   { kind:'canvas',    dur, html }   // a FULLY HANDCRAFTED scene — your own HTML/CSS body (rendered at
//        full resolution, CSS animations captured over `dur`). Best for TEXT-HEAVY / custom scenes
//        (comparison tables, bullet lists, animated stats, quotes, code blocks) with PERFECT text.
//        Theme is exposed as CSS vars: var(--bg) var(--accent) var(--text) var(--sub) var(--font).
//        Use relative units (vw/vh/%/em/flex/grid) so it fills any aspect. No external assets except
//        https image URLs and the theme's Google font (already loaded).
//   { kind:'screencast', dur?, url, steps:[Step] | script:string }  // drive the live app —
//        `steps` = the simple DSL (below), OR `script` = a raw async Playwright body run with
//        (page, goto, click, type, hover, scrollTo, press, wait, log) helpers (cursor-aware),
//        e.g. script: "await goto('/'); await click('Log in'); await type('Email','demo@x.com'); await click('Sign in'); await wait(1500)"
//   { kind:'avatar',    dur, say, pose?, size?, bg? }  // a lip-synced talking PRESENTER (the top-level
//        `presenter` face, lip-synced to this scene's `say` via Wav2Lip). pose: 'corner' (default — a
//        cutaway over a background) | 'full' (fills the frame) | a corner edge (bottom-left/right,
//        top-left/right). size: 0.2-0.9 of frame height for the corner presenter. bg: {prompt|src} |
//        prompt | keyword → the background behind a corner presenter. Best for the HOOK, section
//        intros and the OUTRO call-to-action — not the whole video (b-roll/canvas carry the body).
//   { kind:'credits',   dur }                                       // auto-built attribution
//
// Screencast Step: { action, ... }
//   goto     { path }
//   click    { ref | selector }
//   type     { ref | selector, text, slowmo? }
//   hover    { ref | selector }
//   scrollTo { ref | selector }
//   press    { key }
//   wait     { ms }
// ────────────────────────────────────────────────────────────────────────

// 1080-class canvases (was 720p) — noticeably sharper, and large outputs now go
// to Drive rather than an inline cap, so the size bump is handled.
const ASPECTS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] }
const SCENE_KINDS = ['title', 'video', 'still', 'image', 'canvas', 'screencast', 'avatar', 'credits']
const AVATAR_POSES = ['corner', 'full', 'bottom-left', 'bottom-right', 'top-left', 'top-right']
const STILL_SOURCES = ['keyword', 'topic', 'collection', 'id']
const STEP_ACTIONS = {
  goto: ['path'], click: [], type: ['text'], hover: [], scrollTo: [], press: ['key'], wait: ['ms'],
}
const NEEDS_TARGET = new Set(['click', 'type', 'hover', 'scrollTo']) // need ref OR selector

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isStr = (v) => typeof v === 'string' && v.length > 0

export function validateStoryboard(sb) {
  const e = []
  if (!sb || typeof sb !== 'object') return { ok: false, errors: ['storyboard must be an object'] }

  if (sb.aspect != null && !ASPECTS[sb.aspect]) e.push(`aspect must be one of ${Object.keys(ASPECTS).join(', ')}`)
  for (const k of ['width', 'height', 'fps']) {
    if (sb[k] != null && (!isNum(sb[k]) || sb[k] <= 0)) e.push(`${k} must be a positive number`)
  }
  if (sb.title != null && typeof sb.title !== 'string') e.push('title must be a string')

  // presenter (optional) — the talking-avatar face reused across ALL {kind:'avatar'} scenes.
  // { prompt } (a0 face) | { prompt, seed } (deterministic same face) | { src } (locked portrait URL).
  if (sb.presenter != null && typeof sb.presenter !== 'object' && typeof sb.presenter !== 'string') {
    e.push('presenter must be a string persona or an object ({ prompt, seed? } | { src })')
  } else if (sb.presenter && typeof sb.presenter === 'object' && !isStr(sb.presenter.prompt) && !isStr(sb.presenter.persona) && !isStr(sb.presenter.src) && !isStr(sb.presenter.image_url)) {
    e.push('presenter object needs a `prompt` (describe the face for a0) or a `src` (locked portrait URL)')
  }
  if (sb.transition_duration != null && (!isNum(sb.transition_duration) || sb.transition_duration < 0)) e.push('transition_duration must be a non-negative number (seconds)')

  // cover (optional) — a bespoke poster/thumbnail: { prompt } | { src } | { html } | string
  if (sb.cover != null && typeof sb.cover !== 'object' && typeof sb.cover !== 'string') {
    e.push('cover must be a string prompt or an object ({ prompt } | { src } | { html })')
  } else if (sb.cover && typeof sb.cover === 'object' && !isStr(sb.cover.prompt) && !isStr(sb.cover.src) && !isStr(sb.cover.image_url) && !isStr(sb.cover.html)) {
    e.push('cover object needs a `prompt` (a0 background), `src` (image URL) or `html` (custom cover)')
  }

  // music (optional)
  if (sb.music != null) {
    const m = sb.music
    if (typeof m !== 'object') e.push('music must be an object or null')
    else if (!isStr(m.mood) && !isStr(m.url)) e.push('music needs either a `mood` (from stockdb) or an explicit `url`')
    else if (m.minDur != null && !isNum(m.minDur)) e.push('music.minDur must be a number')
  }

  // scenes
  if (!Array.isArray(sb.scenes) || sb.scenes.length === 0) {
    e.push('scenes must be a non-empty array')
    return { ok: e.length === 0, errors: e }
  }

  sb.scenes.forEach((s, i) => {
    const at = `scenes[${i}]`
    if (!s || typeof s !== 'object') { e.push(`${at} must be an object`); return }
    if (!SCENE_KINDS.includes(s.kind)) { e.push(`${at}.kind must be one of ${SCENE_KINDS.join(', ')}`); return }
    // dur: required for everything except screencast (which can run to its steps)
    if (s.kind !== 'screencast' && (!isNum(s.dur) || s.dur <= 0)) e.push(`${at}.dur must be a positive number (seconds)`)
    if (s.kind === 'screencast' && s.dur != null && (!isNum(s.dur) || s.dur <= 0)) e.push(`${at}.dur (optional) must be a positive number`)

    if (s.kind === 'title') {
      if (!isStr(s.title)) e.push(`${at}.title is required`)
      if (s.sub != null && typeof s.sub !== 'string') e.push(`${at}.sub must be a string`)
    } else if (s.kind === 'video') {
      // A user-supplied asset URL (`src`) OR `keyword`/`q` (Pixabay B-roll from the
      // baked corpus — `keyword` is preferred) OR `prompt` (a0 fallback).
      const hasUserSrc = isStr(s.src) || isStr(s.image_url) || isStr(s.asset)
      if (!hasUserSrc && !isStr(s.keyword) && !isStr(s.q) && !isStr(s.prompt)) e.push(`${at} needs a \`src\` (your image/video URL), \`keyword\`/\`q\` (Pixabay B-roll term) or \`prompt\` (a0 image)`)
      if (s.pick != null && !isNum(s.pick)) e.push(`${at}.pick must be a number`)
      if (s.start != null && !isNum(s.start)) e.push(`${at}.start must be a number (seconds)`)
    } else if (s.kind === 'still' || s.kind === 'image') {
      // `brand` (official brand logo) → `src` (user asset URL) → `prompt` (a0) → one stock source.
      const hasUserSrc = isStr(s.src) || isStr(s.image_url) || isStr(s.asset)
      if (!isStr(s.brand) && !hasUserSrc && !isStr(s.prompt)) {
        const srcs = STILL_SOURCES.filter((k) => s[k] != null)
        if (srcs.length === 0) e.push(`${at} needs a \`brand\` (brand logo), \`src\` (your image URL), \`prompt\` (a0 image) or one stock source: ${STILL_SOURCES.join(' | ')}`)
        if (srcs.length > 1) e.push(`${at} has multiple sources (${srcs.join(', ')}) — use exactly one`)
      }
      if (s.orientation != null && !['horizontal', 'vertical'].includes(s.orientation)) e.push(`${at}.orientation must be horizontal|vertical`)
      if (s.forward != null && typeof s.forward !== 'boolean') e.push(`${at}.forward must be a boolean`)
    } else if (s.kind === 'canvas') {
      // A fully agent-authored HTML/CSS scene (perfect text, custom layout, CSS animation).
      if (!isStr(s.html) && !isStr(s.canvas)) e.push(`${at} needs an \`html\` string (self-contained HTML/CSS for the scene body)`)
    } else if (s.kind === 'avatar') {
      // A lip-synced talking presenter (uses the top-level `presenter` face + this scene's `say`).
      // Optional: pose (corner default | full | a corner edge), size (0.2-0.9 of height for corner),
      // and a background (bg:{prompt|src} | prompt | keyword) shown behind a corner presenter.
      if (s.say != null && typeof s.say !== 'string') e.push(`${at}.say must be a string (the presenter's spoken line)`)
      if (s.pose != null && !AVATAR_POSES.includes(String(s.pose).toLowerCase().replace(/\s+/g, '-'))) e.push(`${at}.pose must be one of ${AVATAR_POSES.join(', ')}`)
      if (s.size != null && !isNum(s.size)) e.push(`${at}.size must be a number (0.2-0.9 of frame height)`)
    } else if (s.kind === 'screencast') {
      if (!isStr(s.url)) e.push(`${at}.url (the running app URL) is required`)
      // A screencast needs EITHER a raw `script` (agent-written Playwright) OR `steps`.
      if (isStr(s.script)) { /* raw script — full control, validated at run time */ }
      else if (!Array.isArray(s.steps) || s.steps.length === 0) e.push(`${at} needs a \`script\` (Playwright routine) or a non-empty \`steps\` array`)
      else s.steps.forEach((st, j) => {
        const sat = `${at}.steps[${j}]`
        if (!st || !STEP_ACTIONS[st.action]) { e.push(`${sat}.action must be one of ${Object.keys(STEP_ACTIONS).join(', ')}`); return }
        for (const req of STEP_ACTIONS[st.action]) if (st[req] == null) e.push(`${sat} (${st.action}) needs \`${req}\``)
        if (NEEDS_TARGET.has(st.action) && !isStr(st.ref) && !isStr(st.selector)) e.push(`${sat} (${st.action}) needs a \`ref\` or \`selector\``)
        if (st.action === 'wait' && !isNum(st.ms)) e.push(`${sat} (wait) \`ms\` must be a number`)
      })
    }
  })

  return { ok: e.length === 0, errors: e }
}

// Normalize an aspect/defaults into concrete {width,height,fps}. Call after validation.
export function resolveCanvas(sb) {
  let [width, height] = sb.aspect ? ASPECTS[sb.aspect] : [sb.width || 1280, sb.height || 720]
  if (sb.width) width = sb.width
  if (sb.height) height = sb.height
  return { width, height, fps: sb.fps || 30 }
}

// ── self-test ───────────────────────────────────────────────────────────────
if (process.argv[1]?.endsWith('storyboard.mjs')) {
  const good = {
    title: 'Launch', aspect: '16:9', music: { mood: 'corporate', minDur: 30 },
    scenes: [
      { kind: 'title', dur: 3.5, title: 'Meet Cartloom', sub: 'commerce, done in a day' },
      { kind: 'video', dur: 4, q: 'city aerial night', pick: 0, start: 1 },
      { kind: 'still', dur: 3.4, topic: 'Technology', forward: true },
      { kind: 'screencast', url: 'http://localhost:5173', steps: [
        { action: 'goto', path: '/' },
        { action: 'type', ref: 'search', text: 'headphones', slowmo: 60 },
        { action: 'click', ref: 'addToCart' },
      ] },
      { kind: 'credits', dur: 3 },
    ],
  }
  const bad = {
    scenes: [
      { kind: 'title', dur: -1 },                                  // missing title, bad dur
      { kind: 'still', dur: 3, keyword: 'city', topic: 'Nature' }, // two sources
      { kind: 'screencast', url: 'http://x', steps: [{ action: 'click' }] }, // no target
      { kind: 'banana', dur: 2 },                                  // bad kind
    ],
  }
  console.log('GOOD →', validateStoryboard(good))
  console.log('BAD  →', validateStoryboard(bad))
}
