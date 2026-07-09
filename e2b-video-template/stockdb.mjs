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
let _music = null, _photos = null, _photoById = null, _topics = null, _collections = null, _videos = null

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
// pixabay_videos.jsonl is OPTIONAL — guard so renders don't break if it's absent
// (older templates without the harvested corpus): pickVideo() returns null then.
const videos = () => (_videos ??= (fs.existsSync(path.join(DIR, 'pixabay_videos.jsonl')) ? readJsonl('pixabay_videos.jsonl') : []))

// How many baked B-roll clips are available (0 = corpus absent). Lets the renderer log
// accurately whether `video` scenes resolve from the corpus vs. fall back to a0 images.
export const videoCorpusSize = () => videos().length

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
  let pool = [], keywordSearch = false
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
    // RANKED keyword match. The human-written `description` is the only TRUSTWORTHY
    // signal — the Unsplash `keywords` are ~80 noisy auto-tags per photo (a coyote photo
    // gets tagged "fine"+"dining"). So match on descriptions FIRST (accurate but sparse),
    // and only backfill from keyword tags when descriptions can't fill `n`. A whole-phrase
    // query like "fine dining" won't appear verbatim, so also score per-token.
    keywordSearch = true
    const kw = String(keyword).toLowerCase().trim()
    const toks = [...new Set(kw.split(/[^a-z0-9]+/).filter((t) => t.length > 1))]
    const rank = (text) => {
      const h = String(text || '').toLowerCase(); if (!h) return 0
      if (kw && h.includes(kw)) return 1000
      let s = 0; for (const t of toks) if (h.includes(t)) s++
      return s
    }
    const rankBy = (field) => {
      const scored = []
      for (const p of photos()) { const s = rank(p[field]); if (s > 0) scored.push([p, s]) }
      return scored.sort((a, b) => b[1] - a[1]).map(([p]) => p)
    }
    const descPool = rankBy('description')
    pool = descPool
    if (descPool.length < Math.max(n, 6)) {
      const seen = new Set(descPool.map((p) => p.photo_id))
      // keyword-tag matches (noisier) ranked by how many query words appear as tags
      const kwPool = []
      for (const p of photos()) {
        if (seen.has(p.photo_id)) continue
        const h = (p.keywords || []).join(' ').toLowerCase()
        let s = kw && h.includes(kw) ? 1000 : 0
        if (!s) for (const t of toks) if (h.includes(t)) s++
        if (s > 0) kwPool.push([p, s])
      }
      kwPool.sort((a, b) => b[1] - a[1])
      pool = [...descPool, ...kwPool.map(([p]) => p)]
    }
  } else {
    pool = photos()
  }
  if (color) pool = pool.filter((p) => (p.dominant_color_keyword || '').toLowerCase() === String(color).toLowerCase())
  if (orientation) pool = pool.filter((p) => orient(p) === orientation)
  if (!pool.length && (topic || collection || keyword)) pool = photos() // never dead-end
  return pickN(pool, n, seed).map(toPhoto)
}

// ── VIDEO (Pixabay B-roll) ────────────────────────────────────────────────────
// pickVideo({ keyword, aspect, minDur, seed }) → one CDN mp4 clip from the baked
// pixabay_videos.jsonl corpus (ZERO API calls at render time). Matches keyword as
// a case-insensitive substring against each row's `keywords` + `tags`, with cascading
// fallbacks (keyword → any tag/keyword token → any clip) so it NEVER dead-ends on a
// live corpus. Deterministic pick via mulberry32(seed). Returns null ONLY when the
// corpus file is absent (older templates) so existing renders don't break.
export function pickVideo({ keyword, aspect, minDur = 0, seed = 0 } = {}) {
  const all = videos()
  if (!all.length) return null // corpus missing → let the caller fall back

  const byAspect = (arr) => (aspect ? arr.filter((v) => v.aspect === aspect) : arr)
  const byDur = (arr) => arr.filter((v) => (v.duration || 0) >= minDur)

  const kw = String(keyword || '').toLowerCase().trim()
  const toks = [...new Set(kw.split(/[^a-z0-9]+/).filter((t) => t.length > 1))]
  const hay = (v) => `${(v.keywords || []).join(' ')} ${(v.tags || []).join(' ')}`.toLowerCase()
  const matchesPhrase = (v) => kw && hay(v).includes(kw)
  const matchesAnyTok = (v) => toks.some((t) => hay(v).includes(t))

  // Cascade: exact phrase (+aspect+dur) → any-token (+aspect+dur) → phrase/token
  // ignoring aspect → any clip (+dur) → any clip. Never returns null on a live corpus.
  let pool = byDur(byAspect(all.filter(matchesPhrase)))
  if (!pool.length) pool = byDur(byAspect(all.filter(matchesAnyTok)))
  if (!pool.length) pool = byDur(all.filter(matchesPhrase))
  if (!pool.length) pool = byDur(all.filter(matchesAnyTok))
  if (!pool.length) pool = byDur(byAspect(all))
  if (!pool.length) pool = byDur(all)
  if (!pool.length) pool = all

  const v = pool[Math.floor(mulberry32(seed + pool.length)() * pool.length)]
  return {
    id: v.id,
    url: v.url, // primary (large); callers preferring a lighter render use url_medium
    url_medium: v.url_medium || '',
    url_small: v.url_small || '',
    thumbnail: v.thumbnail || '',
    duration: v.duration,
    width: v.width,
    height: v.height,
    aspect: v.aspect,
    credit: `Pixabay #${v.id} by ${v.user || 'Unknown'}`,
  }
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
  else if (cmd === 'video') console.log(JSON.stringify(pickVideo({ keyword: a, aspect: b || undefined, minDur: Number(c) || 0 }), null, 2))
  else console.log('usage: stockdb.mjs moods | music <mood> [minDur] | photo <keyword|topic|collection|id> <value> [n] | video <keyword> [aspect] [minDur]')
}
