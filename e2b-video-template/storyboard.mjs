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
//   music?:  { mood: string, minDur?: number }   // resolved via stockdb (Jamendo)
//          | { url: string, credit?: string }     // explicit track
//          | null,
//   scenes:  Scene[]   // >= 1
// }
//
// Scene kinds:
//   { kind:'title',     dur, title, sub? }
//   { kind:'video',     dur, q, pick?, start? }                     // Pixabay b-roll
//   { kind:'still',     dur, keyword|topic|collection|id, pick?, color?, orientation?, forward? }  // Unsplash via stockdb
//   { kind:'screencast', dur?, url, steps:[Step] }                  // drive the live app
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

const ASPECTS = { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [1080, 1080], '4:5': [1080, 1350] }
const SCENE_KINDS = ['title', 'video', 'still', 'screencast', 'credits']
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
      if (!isStr(s.q)) e.push(`${at}.q (Pixabay search term) is required`)
      if (s.pick != null && !isNum(s.pick)) e.push(`${at}.pick must be a number`)
      if (s.start != null && !isNum(s.start)) e.push(`${at}.start must be a number (seconds)`)
    } else if (s.kind === 'still') {
      const srcs = STILL_SOURCES.filter((k) => s[k] != null)
      if (srcs.length === 0) e.push(`${at} needs one source: ${STILL_SOURCES.join(' | ')}`)
      if (srcs.length > 1) e.push(`${at} has multiple sources (${srcs.join(', ')}) — use exactly one`)
      if (s.orientation != null && !['horizontal', 'vertical'].includes(s.orientation)) e.push(`${at}.orientation must be horizontal|vertical`)
      if (s.forward != null && typeof s.forward !== 'boolean') e.push(`${at}.forward must be a boolean`)
    } else if (s.kind === 'screencast') {
      if (!isStr(s.url)) e.push(`${at}.url (the running app URL) is required`)
      if (!Array.isArray(s.steps) || s.steps.length === 0) e.push(`${at}.steps must be a non-empty array`)
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
