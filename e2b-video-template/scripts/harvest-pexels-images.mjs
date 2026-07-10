// ────────────────────────────────────────────────────────────────────────
// harvest-pexels-images.mjs — pre-harvest a Pexels IMAGE corpus (hotlink-safe
// src.large / src.large2x CDN links across many genres) into
// stockdb/pexels_images.jsonl, so the render engine's photo resolver can draw
// genre-appropriate stills from a THIRD pool alongside the Unsplash + Pixabay
// corpora, with ZERO API calls at render time.
//
//   PEXELS_KEY=<key> node scripts/harvest-pexels-images.mjs
//
// The API key is read from env ONLY and NEVER written to the output file — the
// JSONL holds only public CDN links + metadata, which are safe to commit.
//
// Pexels gives NO tag list, so `keywords` are derived from the query keyword
// PLUS words parsed out of the `alt` description text, so pickPhotos' keyword
// matching still has signal to rank on.
//
// Rate limit: Pexels default is ~200 requests/HOUR. So we run a MODEST keyword
// list (1 page/keyword, per_page 80) and throttle ~16s/req to stay well under
// the cap. We honor X-Ratelimit-Remaining / X-Ratelimit-Reset: if remaining
// hits 0 we FLUSH, log, and STOP gracefully — a partial corpus is fine. One bad
// keyword is logged and skipped, never aborts; flushed after every keyword.
// ────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = process.env.PEXELS_KEY
if (!KEY) { console.error('ERROR: set PEXELS_KEY in the environment (never hardcode it).'); process.exit(1) }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'stockdb', 'pexels_images.jsonl')

const PER_PAGE = 80        // Pexels per_page max is 80
const THROTTLE_MS = 2000   // ~2s/req — the key's real quota is ~25k/hr, not 200/hr
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── stopwords dropped from alt-text-derived keywords ────────────────────────
const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'was', 'are', 'were', 'has', 'have', 'had',
  'his', 'her', 'its', 'their', 'our', 'your', 'you', 'she', 'him', 'they', 'them', 'who', 'what',
  'which', 'when', 'where', 'why', 'how', 'all', 'any', 'some', 'not', 'but', 'out', 'off', 'over',
  'under', 'into', 'onto', 'near', 'front', 'back', 'top', 'photo', 'image', 'picture', 'shot', 'view',
])

// ── curated keyword list — ~110 broad, photo-friendly terms across genres ───
const KEYWORDS = [
  // nature / landscape / seasons
  'nature', 'landscape', 'forest', 'mountains', 'waterfall', 'river', 'sunset', 'sunrise', 'autumn',
  'winter', 'flowers', 'desert', 'meadow', 'tree',
  // ocean / water / sky / space
  'ocean', 'beach', 'underwater', 'rain', 'lake', 'clouds', 'sky', 'stars', 'space', 'galaxy',
  // city / travel / architecture
  'city', 'skyline', 'traffic', 'travel', 'road', 'bridge', 'train', 'architecture', 'building',
  'street', 'interior', 'home',
  // business / office / finance
  'business', 'office', 'meeting', 'handshake', 'startup', 'finance', 'money', 'teamwork',
  'presentation', 'laptop',
  // technology / abstract
  'technology', 'data', 'network', 'coding', 'robot', 'abstract', 'digital', 'neon',
  'gradient', 'texture', 'pattern',
  // people / lifestyle
  'people', 'crowd', 'friends', 'family', 'children', 'portrait', 'woman', 'man', 'student', 'smile',
  // food / drink
  'food', 'cooking', 'coffee', 'restaurant', 'fruit', 'breakfast', 'vegetables', 'wine',
  // fitness / sports
  'fitness', 'gym', 'running', 'yoga', 'sports', 'soccer', 'cycling', 'hiking',
  // animals / science / medical
  'animals', 'wildlife', 'birds', 'dog', 'cat', 'horse', 'science', 'laboratory', 'medical', 'health',
  // industry / energy / agriculture
  'industry', 'factory', 'construction', 'energy', 'solar', 'agriculture', 'farming', 'logistics',
  // celebration / night / fire
  'celebration', 'fireworks', 'party', 'concert', 'fire', 'smoke', 'christmas', 'wedding',
  // luxury / fashion / cars
  'luxury', 'fashion', 'jewelry', 'car', 'motorcycle', 'shoes',
  // creative / education / misc
  'gaming', 'music', 'art', 'books', 'education', 'guitar', 'camera',
  'minimal', 'vintage', 'bokeh', 'macro', 'silhouette', 'plant', 'sunlight',
]

// ── derive aspect bucket from width/height ──────────────────────────────────
function aspectOf(w, h) {
  if (!w || !h) return '16:9'
  const r = w / h
  if (r >= 1.25) return '16:9'
  if (r <= 0.8) return '9:16'
  return '1:1'
}

// ── parse alt text into clean keyword tokens ────────────────────────────────
function altKeywords(alt) {
  return [...new Set(
    String(alt || '').toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 3 && !STOP.has(t))
  )]
}

// ── one fetch; returns { body, remaining, reset } ───────────────────────────
async function fetchPage(q, page) {
  const p = new URLSearchParams({ query: q, per_page: String(PER_PAGE), page: String(page) })
  const url = `https://api.pexels.com/v1/search?${p}`
  const res = await fetch(url, { headers: { Authorization: KEY } })
  const remaining = Number(res.headers.get('X-Ratelimit-Remaining'))
  const reset = Number(res.headers.get('X-Ratelimit-Reset'))
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  const body = await res.json()
  return { body, remaining, reset }
}

// ── row builder shared by test-fetch + main loop ────────────────────────────
function rowFromHit(h, q) {
  const src = h.src || {}
  const image_url = src.large || src.medium || src.large2x || src.original || ''
  if (!image_url) return null
  return {
    photo_id: String(h.id),
    source: 'pexels',
    page_url: h.url || '',
    image_url,
    width: h.width || 0,
    height: h.height || 0,
    aspect_ratio: (h.width && h.height) ? h.width / h.height : 0,
    description: h.alt || '',
    photographer: h.photographer || '',
    keywords: [q, ...altKeywords(h.alt)],
    download_url_1920w: src.large2x || src.original || image_url,
    aspect: aspectOf(h.width, h.height),
  }
}

// ── main ────────────────────────────────────────────────────────────────────
const byId = new Map()   // photo_id → row (merged query keywords across the run)
let requests = 0
const t0 = Date.now()

function flush() {
  const lines = [...byId.values()].map((r) => JSON.stringify(r)).join('\n')
  fs.writeFileSync(OUT, lines + (lines ? '\n' : ''))
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })

// ── STEP 1: single test fetch to confirm key + header auth ──────────────────
console.log('Test fetch: query="nature" per_page=80 …')
let firstBody
try {
  const { body, remaining, reset } = await fetchPage('nature', 1)
  requests++
  firstBody = body
  const hit = (body.photos || [])[0]
  if (!hit) { console.error('Test fetch returned 0 photos — unexpected. Aborting.'); process.exit(1) }
  console.log('AUTH OK. sample hit:', JSON.stringify(rowFromHit(hit, 'nature'), null, 2))
  console.log(`quota after test: remaining=${remaining} reset=${reset}`)
} catch (e) {
  console.error(`AUTH FAILED (${e.status || '?'}): ${e.message}`)
  console.error('Key rejected or endpoint error — STOPPING, not looping.')
  process.exit(1)
}

// seed the corpus with the test-fetch results (don't waste that request)
for (const h of firstBody.photos || []) {
  const r = rowFromHit(h, 'nature'); if (r) byId.set(r.photo_id, r)
}
flush()
console.log(`[seed] "nature" · unique so far: ${byId.size}`)

// ── STEP 2: harvest the rest of the keyword list ────────────────────────────
let stopped = false
for (let k = 1; k < KEYWORDS.length && !stopped; k++) {
  const q = KEYWORDS[k]
  await sleep(THROTTLE_MS)
  let added = 0
  try {
    const { body, remaining, reset } = await fetchPage(q, 1)
    requests++
    for (const h of body.photos || []) {
      const pid = String(h.id)
      const existing = byId.get(pid)
      if (existing) {
        if (!existing.keywords.includes(q)) existing.keywords.push(q)
        continue
      }
      const r = rowFromHit(h, q); if (!r) continue
      byId.set(pid, r); added++
    }
    flush()
    console.log(`[${k + 1}/${KEYWORDS.length}] "${q}" +${added} · unique: ${byId.size} · quota rem=${remaining}`)
    // NOTE: the remaining header is unreliable on this key (returns -1 / drops out
    // intermittently despite a ~25k/hr real quota), so we do NOT self-stop on it —
    // only a genuine HTTP 429 (below) halts the run.
  } catch (e) {
    console.log(`   ! "${q}" failed: ${e.message} — skipping`)
    if (e.status === 429) {
      console.log('   429 rate-limited — FLUSHING and STOPPING gracefully.')
      stopped = true
    }
  }
}

flush()
const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
const bytes = fs.existsSync(OUT) ? fs.statSync(OUT).size : 0
console.log('\n──────────────────────────────────────────────')
console.log(`DONE${stopped ? ' (stopped early on quota)' : ''}. unique images: ${byId.size} · requests: ${requests} · elapsed: ${elapsed}s`)
console.log(`file: ${OUT} (${(bytes / 1024 / 1024).toFixed(2)} MB)`)
