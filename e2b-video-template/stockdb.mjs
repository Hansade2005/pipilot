// ────────────────────────────────────────────────────────────────────────
// stockdb.mjs — zero-API resolver over the baked stock indexes.
//
// Reads the local JSONL corpus (no network, no rate limits, deterministic):
//   jamendo_moodtheme.jsonl     18,486 tracks — mood-addressable music
//   unsplash_photos.jsonl       25,000 photos — the id→URL resolver (+ keywords,
//                               dominant_color, photographer, aspect_ratio)
//   unsplash_topics.jsonl       67 official packs  (photo_id selectors)
//   unsplash_collections.jsonl  41,871 community packs (photo_id selectors)
//
// The packs reference MORE photo_ids than the 25k photos file covers, so the
// resolver builds a photo_id→row map once and SKIPS any id it can't resolve.
//
// Baked into the pipilot-video E2B template at /opt/stockdb. Override the dir
// for local dev with STOCKDB_DIR.
// ────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'

const DIR = process.env.STOCKDB_DIR || '/opt/stockdb'

// ── lazy, in-process caches (each file parsed at most once) ─────────────────
let _music = null, _photos = null, _photoById = null, _topics = null, _collections = null

function readJsonl(file) {
  const txt = fs.readFileSync(path.join(DIR, file), 'utf8')
  const out = []
  for (const line of txt.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try { out.push(JSON.parse(t)) } catch { /* skip a corrupt line, never throw */ }
  }
  return out
}
const music = () => (_music ??= readJsonl('jamendo_moodtheme.jsonl'))
const photos = () => (_photos ??= readJsonl('unsplash_photos.jsonl'))
const photoById = () => (_photoById ??= new Map(photos().map((p) => [p.photo_id, p])))
const topics = () => (_topics ??= readJsonl('unsplash_topics.jsonl'))
const collections = () => (_collections ??= readJsonl('unsplash_collections.jsonl'))

// Deterministic PRNG so a given (seed) always yields the same pick — renders are
// reproducible, and varying the seed per scene index avoids repeats without RNG.
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pickN = (arr, n, seed = 0) => {
  if (arr.length <= n) return arr.slice()
  const rnd = mulberry32(seed + arr.length)
  const idx = new Set()
  while (idx.size < n) idx.add(Math.floor(rnd() * arr.length))
  return [...idx].map((i) => arr[i])
}

// ── MUSIC ───────────────────────────────────────────────────────────────────
// pickMusic({ mood, minDur, seed }) → one track. mood matches Jamendo's tag
// vocabulary (happy, epic, corporate, advertising, documentary, inspiring,
// uplifting, energetic, emotional, dark, film, calm, …). Falls back to
// 'background' then any track so it NEVER returns null on a live corpus.
export function pickMusic({ mood = 'background', minDur = 0, seed = 0 } = {}) {
  const all = music()
  const byMood = (m) => all.filter((t) => Array.isArray(t.moods) && t.moods.includes(m) && (t.duration_sec || 0) >= minDur)
  let pool = byMood(mood)
  if (!pool.length) pool = byMood('background')
  if (!pool.length) pool = all.filter((t) => (t.duration_sec || 0) >= minDur)
  if (!pool.length) pool = all
  const t = pool[Math.floor(mulberry32(seed + pool.length)() * pool.length)]
  return {
    id: t.numeric_id,
    url: t.stream_url || `https://mp3d.jamendo.com/download/track/${t.numeric_id}/mp31/`,
    duration_sec: t.duration_sec,
    mood,
    credit: `Jamendo #${t.numeric_id}`,
  }
}

export const MOODS = () => {
  const c = new Map()
  for (const t of music()) for (const m of t.moods || []) c.set(m, (c.get(m) || 0) + 1)
  return [...c.entries()].sort((a, b) => b[1] - a[1])
}

// ── PHOTOS ──────────────────────────────────────────────────────────────────
const orient = (p) => ((p.aspect_ratio || (p.width / p.height)) >= 1 ? 'horizontal' : 'vertical')
function toPhoto(p) {
  return {
    id: p.photo_id,
    url: p.download_url_1920w || (p.image_url ? `${p.image_url}?w=1920&q=80` : null),
    width: p.width, height: p.height, aspect_ratio: p.aspect_ratio,
    color: p.dominant_color_hex, colorName: p.dominant_color_keyword,
    description: p.description || '',
    credit: `${p.photographer || 'Unknown'} / Unsplash`,
  }
}

// pickPhotos({ keyword | topic | collection | id, n, color, orientation, seed })
// → array of resolved photos (url + credit + color/aspect). Pack ids that aren't
// in the 25k photos file are silently skipped.
export function pickPhotos({ keyword, topic, collection, id, n = 1, color, orientation, seed = 0 } = {}) {
  let pool = []
  if (id) {
    const p = photoById().get(id)
    return p ? [toPhoto(p)] : []
  } else if (topic) {
    const t = topics().find((x) => x.topic?.toLowerCase() === String(topic).toLowerCase())
    pool = (t?.photo_ids || []).map((pid) => photoById().get(pid)).filter(Boolean)
  } else if (collection) {
    const c = collections().find((x) => String(x.collection_id) === String(collection) || x.title?.toLowerCase() === String(collection).toLowerCase())
    pool = (c?.photo_ids || []).map((pid) => photoById().get(pid)).filter(Boolean)
  } else if (keyword) {
    const kw = String(keyword).toLowerCase()
    pool = photos().filter((p) =>
      (p.keywords || []).some((k) => k.toLowerCase().includes(kw)) ||
      (p.description || '').toLowerCase().includes(kw))
  } else {
    pool = photos()
  }
  if (color) pool = pool.filter((p) => (p.dominant_color_keyword || '').toLowerCase() === String(color).toLowerCase())
  if (orientation) pool = pool.filter((p) => orient(p) === orientation)
  if (!pool.length && (topic || collection || keyword)) pool = photos() // never dead-end
  return pickN(pool, n, seed).map(toPhoto)
}

// ── tiny CLI for local testing ──────────────────────────────────────────────
//   STOCKDB_DIR=... node stockdb.mjs moods
//   STOCKDB_DIR=... node stockdb.mjs music corporate 60
//   STOCKDB_DIR=... node stockdb.mjs photo keyword city 3
//   STOCKDB_DIR=... node stockdb.mjs photo topic Technology 3
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('stockdb.mjs')) {
  const [cmd, a, b, c] = process.argv.slice(2)
  if (cmd === 'moods') console.log(MOODS().slice(0, 40).map(([m, n]) => `${m} (${n})`).join(', '))
  else if (cmd === 'music') console.log(pickMusic({ mood: a || 'background', minDur: Number(b) || 0 }))
  else if (cmd === 'photo') console.log(JSON.stringify(pickPhotos({ [a]: b, n: Number(c) || 1 }), null, 2))
  else console.log('usage: stockdb.mjs moods | music <mood> [minDur] | photo <keyword|topic|collection|id> <value> [n]')
}
