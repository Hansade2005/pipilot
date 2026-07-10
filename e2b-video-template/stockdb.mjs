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

// Filler words that would match almost any caption/tag — dropped from query tokens so
// relevance is driven by the meaningful words.
const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'with', 'for', 'by', 'from', 'as', 'is', 'it', 'this', 'that', 'up', 'out', 'over'])
// Split a haystack into a set of whole words (for word-boundary matching, not substring).
const wordSet = (h) => new Set(String(h || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))

// ── lazy, in-process caches (each file parsed at most once) ─────────────────
let _music = null, _photos = null, _photoById = null, _topics = null, _collections = null, _videos = null, _pixPhotos = null, _pexVideos = null, _pexPhotos = null

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
// pexels_videos.jsonl is OPTIONAL — a second, Pexels-sourced B-roll pool merged into the
// video pool (same schema as Pixabay rows). Guarded so an absent file just means empty.
const pexVideos = () => (_pexVideos ??= (fs.existsSync(path.join(DIR, 'pexels_videos.jsonl')) ? readJsonl('pexels_videos.jsonl') : []))
// The full B-roll pool = Pixabay ∪ Pexels clips (both share the pickVideo row shape).
const allVideos = () => [...videos(), ...pexVideos()]
// pixabay_images.jsonl is OPTIONAL — a second, Pixabay-sourced photo pool searched
// alongside Unsplash in pickPhotos' keyword branch. Guarded so renders never break
// if the harvested corpus is absent (older templates): the pool is just empty then.
const pixPhotos = () => (_pixPhotos ??= (fs.existsSync(path.join(DIR, 'pixabay_images.jsonl')) ? readJsonl('pixabay_images.jsonl') : []))
// pexels_images.jsonl is OPTIONAL — a third photo pool (Pexels), searched alongside
// Unsplash + Pixabay in pickPhotos' keyword branch. Guarded like the others.
const pexPhotos = () => (_pexPhotos ??= (fs.existsSync(path.join(DIR, 'pexels_images.jsonl')) ? readJsonl('pexels_images.jsonl') : []))

// How many baked B-roll clips are available (0 = corpus absent). Lets the renderer log
// accurately whether `video` scenes resolve from the corpus vs. fall back to a0 images.
export const videoCorpusSize = () => allVideos().length

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
// Map a caller's free-text mood onto the ACTUAL Jamendo tag vocabulary present in the corpus, so a
// request like "upbeat corporate" or "chill" always resolves to well-matched tracks. Values are real
// corpus tags (happy/film/energetic/relaxing/emotional/epic/inspiring/corporate/uplifting/… ).
const MOOD_ALIASES = {
  upbeat: ['upbeat', 'energetic', 'happy', 'positive', 'fun'],
  energetic: ['energetic', 'upbeat', 'powerful', 'fast', 'action'],
  happy: ['happy', 'positive', 'fun', 'uplifting', 'summer'],
  corporate: ['corporate', 'advertising', 'motivational', 'commercial', 'inspiring'],
  business: ['corporate', 'advertising', 'motivational', 'commercial'],
  advertising: ['advertising', 'commercial', 'corporate', 'upbeat'],
  inspiring: ['inspiring', 'uplifting', 'motivational', 'hopeful', 'positive'],
  inspirational: ['inspiring', 'uplifting', 'motivational', 'hopeful'],
  motivational: ['motivational', 'inspiring', 'uplifting', 'powerful'],
  uplifting: ['uplifting', 'inspiring', 'positive', 'hopeful'],
  calm: ['calm', 'relaxing', 'soft', 'ambiental', 'meditative'],
  chill: ['relaxing', 'calm', 'mellow', 'soft', 'cool'],
  relaxed: ['relaxing', 'calm', 'soft', 'mellow'],
  relaxing: ['relaxing', 'calm', 'soft', 'ambiental'],
  ambient: ['ambiental', 'soundscape', 'meditative', 'calm', 'space'],
  peaceful: ['calm', 'relaxing', 'meditative', 'soft'],
  epic: ['epic', 'dramatic', 'powerful', 'trailer', 'action'],
  cinematic: ['film', 'movie', 'epic', 'dramatic', 'soundscape'],
  dramatic: ['dramatic', 'drama', 'epic', 'emotional'],
  trailer: ['trailer', 'epic', 'powerful', 'dramatic', 'action'],
  powerful: ['powerful', 'epic', 'energetic', 'dramatic'],
  action: ['action', 'energetic', 'powerful', 'fast', 'sport'],
  emotional: ['emotional', 'sad', 'melancholic', 'romantic', 'ballad'],
  sad: ['sad', 'melancholic', 'emotional', 'slow'],
  romantic: ['romantic', 'love', 'emotional', 'soft'],
  dark: ['dark', 'deep', 'horror', 'dramatic'],
  tech: ['space', 'soundscape', 'energetic', 'corporate', 'ambiental'],
  technology: ['space', 'soundscape', 'energetic', 'corporate'],
  modern: ['energetic', 'corporate', 'upbeat', 'cool'],
  fun: ['fun', 'happy', 'funny', 'party', 'groovy'],
  documentary: ['documentary', 'film', 'inspiring', 'ambiental'],
  background: ['background', 'ambiental', 'calm', 'soft'],
}
// pickMusic({ mood, minDur, seed }) → one track, SCORED by how many of a track's Jamendo mood tags
// match the (alias-expanded, tokenized) request — so the closest-fitting track wins, not just a
// first exact hit. Cascades to background → any dur-eligible → any, so it NEVER returns null.
export function pickMusic({ mood = 'background', minDur = 0, seed = 0 } = {}) {
  const all = music()
  const okDur = (t) => (t.duration_sec || 0) >= minDur
  // Target tag set = the request's own words + their aliases (+ whole-string alias).
  const raw = String(mood || '').toLowerCase().trim()
  const targets = new Set()
  for (const w of raw.split(/[^a-z]+/).filter(Boolean)) { targets.add(w); for (const a of MOOD_ALIASES[w] || []) targets.add(a) }
  for (const a of MOOD_ALIASES[raw] || []) targets.add(a)
  if (!targets.size) targets.add('background')
  // Score every dur-eligible track by tag overlap. Keep a BAND of the top scorers (not only the
  // single max) so there's real variety — otherwise a mood whose top score is held by one track
  // returns that SAME track on every video. Widen the band downward until the pool is healthy.
  const scored = []
  for (const t of all) {
    if (!okDur(t)) continue
    let score = 0
    for (const m of t.moods || []) if (targets.has(String(m).toLowerCase())) score++
    if (score > 0) scored.push([t, score])
  }
  let pool
  if (scored.length) {
    scored.sort((a, b) => b[1] - a[1])
    const bestScore = scored[0][1]
    let cut = bestScore
    pool = scored.filter(([, s]) => s >= cut).map(([t]) => t)
    // Include the next score tiers until we have enough candidates for genuine variety.
    while (pool.length < 30 && cut > 1) { cut--; pool = scored.filter(([, s]) => s >= cut).map(([t]) => t) }
  } else {
    pool = all.filter((t) => okDur(t) && Array.isArray(t.moods) && t.moods.includes('background'))
  }
  if (!pool.length) pool = all.filter(okDur)
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

// ── BRAND LOGOS ───────────────────────────────────────────────────────────────
// Resolve a brand name → an official logo URL. Baked overrides win (our own brands + any we
// hardcode). Otherwise use logo.dev: it looks a company up by NAME directly (https://img.logo.dev/
// name/<Company>) so almost anything resolves, and by DOMAIN when we know one (crisper). The token
// is a PUBLISHABLE key (safe to ship); override via LOGO_DEV_TOKEN. Docs: logo.dev/docs/logo-images.
// Free tier + commercial use requires a "Logo.dev" attribution — the render credits that logo.
const LOGO_TOKEN = process.env.LOGO_DEV_TOKEN || 'pk_FECnJ8AdT2y2CwzgYtqX_g'
const BRAND_LOGOS = {
  'pipilot': 'https://pipilot.dev/logo.png',
  'pixelways': 'https://www.pixelways.co/logo.png',
  'pixelways solutions': 'https://www.pixelways.co/logo.png',
  'pixelways solutions inc': 'https://www.pixelways.co/logo.png',
}
const BRAND_DOMAINS = {
  'coca cola': 'coca-cola.com', 'coca-cola': 'coca-cola.com', 'coke': 'coca-cola.com',
  'pepsi': 'pepsi.com', 'sprite': 'coca-cola.com', 'fanta': 'coca-cola.com', 'red bull': 'redbull.com', 'redbull': 'redbull.com',
  'monster energy': 'monsterenergy.com', 'gatorade': 'gatorade.com', 'starbucks': 'starbucks.com', 'nescafe': 'nescafe.com',
  'heineken': 'heineken.com', 'budweiser': 'budweiser.com', 'corona': 'coronaextra.com',
  'apple': 'apple.com', 'iphone': 'apple.com', 'ipad': 'apple.com', 'macbook': 'apple.com', 'samsung': 'samsung.com',
  'google': 'google.com', 'microsoft': 'microsoft.com', 'windows': 'microsoft.com', 'android': 'android.com',
  'playstation': 'playstation.com', 'xbox': 'xbox.com', 'nintendo': 'nintendo.com', 'tesla': 'tesla.com',
  'nvidia': 'nvidia.com', 'intel': 'intel.com', 'sony': 'sony.com', 'huawei': 'huawei.com', 'xiaomi': 'mi.com',
  'dell': 'dell.com', 'hp': 'hp.com', 'lenovo': 'lenovo.com',
  'facebook': 'facebook.com', 'instagram': 'instagram.com', 'twitter': 'x.com', 'x': 'x.com', 'tiktok': 'tiktok.com',
  'youtube': 'youtube.com', 'netflix': 'netflix.com', 'spotify': 'spotify.com', 'whatsapp': 'whatsapp.com',
  'snapchat': 'snapchat.com', 'linkedin': 'linkedin.com', 'amazon': 'amazon.com', 'ebay': 'ebay.com', 'paypal': 'paypal.com',
  'nike': 'nike.com', 'adidas': 'adidas.com', 'puma': 'puma.com', 'gucci': 'gucci.com', 'louis vuitton': 'louisvuitton.com',
  'chanel': 'chanel.com', 'rolex': 'rolex.com', 'levis': 'levi.com', 'zara': 'zara.com', 'under armour': 'underarmour.com',
  'new balance': 'newbalance.com', 'vans': 'vans.com', 'converse': 'converse.com',
  'bmw': 'bmw.com', 'mercedes': 'mercedes-benz.com', 'mercedes benz': 'mercedes-benz.com', 'audi': 'audi.com',
  'toyota': 'toyota.com', 'honda': 'honda.com', 'ford': 'ford.com', 'ferrari': 'ferrari.com', 'lamborghini': 'lamborghini.com',
  'porsche': 'porsche.com', 'volkswagen': 'vw.com', 'jeep': 'jeep.com', 'harley davidson': 'harley-davidson.com',
  'mcdonalds': 'mcdonalds.com', "mcdonald's": 'mcdonalds.com', 'kfc': 'kfc.com', 'burger king': 'bk.com',
  'subway': 'subway.com', 'pizza hut': 'pizzahut.com', 'dominos': 'dominos.com', 'dunkin': 'dunkindonuts.com',
  'oreo': 'oreo.com', 'nutella': 'nutella.com', 'pringles': 'pringles.com', 'doritos': 'doritos.com', 'lays': 'lays.com',
  'lego': 'lego.com', 'ikea': 'ikea.com', 'disney': 'disney.com', 'marvel': 'marvel.com', 'visa': 'visa.com',
  'mastercard': 'mastercard.com', 'shell': 'shell.com', 'bp': 'bp.com', 'nescafé': 'nescafe.com',
}
export function brandLogo(name, { size = 512 } = {}) {
  const raw = String(name || '').trim()
  const k = raw.toLowerCase()
  if (!k) return null
  if (BRAND_LOGOS[k]) return BRAND_LOGOS[k] // our own / hardcoded full-res logos win
  const q = `token=${LOGO_TOKEN}&size=${Math.min(size, 800)}&format=png&retina=true`
  // Prefer a known DOMAIN (crispest), else a bare domain the caller passed, else look up by NAME.
  const known = BRAND_DOMAINS[k.replace(/\s+(inc|llc|ltd|corp|co|company|solutions)\.?$/, '').trim()]
  if (known) return `https://img.logo.dev/${known}?${q}`
  if (/^[a-z0-9-]+\.[a-z]{2,}$/.test(k)) return `https://img.logo.dev/${k}?${q}`
  return `https://img.logo.dev/name/${encodeURIComponent(raw)}?${q}`
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
    credit: `${p.photographer || 'Unknown'} / ${p.source === 'pixabay' ? 'Pixabay' : p.source === 'pexels' ? 'Pexels' : 'Unsplash'}`,
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
    // Search BOTH the Unsplash corpus and the optional Pixabay pool. Pixabay rows
    // already carry description/keywords/image_url/download_url_1920w/aspect_ratio/
    // photographer, so they flow through rank()/toPhoto() identically. Absent file
    // → empty pool → behaviour is unchanged from Unsplash-only.
    const searchPool = [...photos(), ...pixPhotos(), ...pexPhotos()]
    const kw = String(keyword).toLowerCase().trim()
    // Query tokens, minus filler words that would match everything.
    const toks = [...new Set(kw.split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t)))]
    // Score on WHOLE-WORD membership, not substring — otherwise "ice" matches "off-ice-",
    // "can" matches "candle"/"canyon", wrecking relevance. Whole phrase present = big boost;
    // otherwise count how many query words appear as their own word in the text.
    const rank = (text) => {
      const h = String(text || '').toLowerCase(); if (!h) return 0
      if (kw && h.includes(kw)) return 1000
      const words = wordSet(h)
      let s = 0; for (const t of toks) if (words.has(t)) s++
      return s
    }
    const rankBy = (field) => {
      const scored = []
      for (const p of searchPool) { const s = rank(p[field]); if (s > 0) scored.push([p, s]) }
      return scored.sort((a, b) => b[1] - a[1]).map(([p]) => p)
    }
    const descPool = rankBy('description')
    pool = descPool
    if (descPool.length < Math.max(n, 6)) {
      const seen = new Set(descPool.map((p) => p.photo_id))
      // keyword-tag matches (noisier) ranked by how many query words appear as whole tags
      const kwPool = []
      for (const p of searchPool) {
        if (seen.has(p.photo_id)) continue
        const joined = (p.keywords || []).join(' ').toLowerCase()
        let s = kw && joined.includes(kw) ? 1000 : 0
        if (!s) { const words = wordSet(joined); for (const t of toks) if (words.has(t)) s++ }
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
// pickVideo({ keyword, aspect, minDur, seed }) → one CDN mp4 clip from the baked Pixabay+Pexels
// corpus (ZERO API calls at render time). Matches the keyword by WHOLE WORD against each row's
// `keywords` + `tags` (phrase match preferred, else best token overlap), then refines by
// aspect/duration. Returns NULL when nothing genuinely matches (or the corpus is absent) so the
// render engine falls back to an on-topic a0-generated image instead of a random clip.
export function pickVideo({ keyword, aspect, minDur = 0, seed = 0 } = {}) {
  const all = allVideos() // Pixabay ∪ Pexels B-roll
  if (!all.length) return null // corpus missing → let the caller fall back

  const byAspect = (arr) => (aspect ? arr.filter((v) => v.aspect === aspect) : arr)
  const byDur = (arr) => arr.filter((v) => (v.duration || 0) >= minDur)

  const kw = String(keyword || '').toLowerCase().trim()
  const toks = [...new Set(kw.split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t)))]
  const hay = (v) => `${(v.keywords || []).join(' ')} ${(v.tags || []).join(' ')}`.toLowerCase()
  // Relevance score: whole phrase present = big; else count query words that appear as WHOLE
  // words (word-boundary, so "cola" doesn't match "cho-cola-te", "can" doesn't match "candle").
  const score = (v) => {
    const h = hay(v)
    if (kw && h.includes(kw)) return 100
    const w = wordSet(h); let s = 0; for (const t of toks) if (w.has(t)) s++
    return s
  }
  // GENUINE matches only. If nothing in the corpus actually matches the keyword, return null so the
  // render engine falls back to an on-topic a0-generated image — MUCH better than a random clip.
  let cands = all.map((v) => [v, score(v)]).filter(([, s]) => s > 0)
  if (!cands.length) return null
  const top = Math.max(...cands.map(([, s]) => s))
  cands = cands.filter(([, s]) => s === top).map(([v]) => v) // best-scoring clips only
  // Refine by aspect/duration, but never let a refinement empty an otherwise-good result set.
  let pool = byDur(byAspect(cands))
  if (!pool.length) pool = byDur(cands)
  if (!pool.length) pool = cands

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
