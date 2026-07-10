// ────────────────────────────────────────────────────────────────────────
// harvest-pixabay-images.mjs — pre-harvest a Pixabay IMAGE corpus (hotlink-safe
// largeImageURL links across many genres) into stockdb/pixabay_images.jsonl, so
// the render engine's photo resolver can draw genre-appropriate stills from a
// second pool alongside the Unsplash corpus, with ZERO API calls at render time.
//
//   PIXABAY_KEY=<key> node scripts/harvest-pixabay-images.mjs
//
// The API key is read from env ONLY and NEVER written to the output file — the
// JSONL holds only public CDN links + metadata, which are safe to commit.
//
// Rate limit: 100 req / 60s. We throttle to ~680ms/req and honor the
// X-RateLimit-Remaining / X-RateLimit-Reset headers (back off when low, and on
// HTTP 429 sleep until reset then retry). Resilient: one bad keyword is logged
// and skipped, never aborts the run; the corpus is flushed after every keyword
// so a crash mid-run never loses harvested rows.
// ────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = process.env.PIXABAY_KEY
if (!KEY) { console.error('ERROR: set PIXABAY_KEY in the environment (never hardcode it).'); process.exit(1) }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'stockdb', 'pixabay_images.jsonl')

const PER_PAGE = 200      // Pixabay image per_page max is 200
const PAGES = 3           // up to 3 pages/keyword — pull deeper per keyword
const THROTTLE_MS = 680   // ~88 req/min — safely under the 100/60s cap
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── curated keyword list — ~150 terms spanning many genres ──────────────────
const KEYWORDS = [
  // nature / landscape / seasons
  'nature', 'landscape', 'forest', 'mountains', 'waterfall', 'river', 'sunset', 'sunrise', 'autumn',
  'winter snow', 'spring flowers', 'summer', 'desert', 'jungle', 'meadow', 'northern lights', 'valley',
  'canyon', 'field', 'tree', 'flowers',
  // ocean / water
  'ocean', 'ocean waves', 'beach', 'underwater', 'coral reef', 'rain', 'water drop', 'lake', 'island',
  'tropical',
  // sky / space / weather
  'clouds', 'sky', 'stars', 'space', 'galaxy', 'milky way', 'storm', 'lightning', 'moon', 'rainbow',
  // city / travel / architecture / aerial
  'city', 'city night', 'skyline', 'traffic', 'aerial drone', 'travel', 'road', 'highway', 'bridge',
  'airport', 'train', 'architecture', 'building', 'street', 'skyscraper', 'interior', 'home', 'village',
  // business / office / finance
  'business', 'office', 'meeting', 'handshake', 'startup', 'coworking', 'finance', 'stock market',
  'money', 'success', 'teamwork', 'presentation', 'workspace', 'laptop',
  // technology / ai / abstract
  'technology', 'artificial intelligence', 'data', 'network', 'code programming', 'server room',
  'robot', 'circuit', 'abstract', 'abstract background', 'particles', 'digital', 'hologram', 'neon',
  'gradient background', 'texture', 'pattern', 'geometric',
  // people / lifestyle
  'people', 'crowd', 'walking', 'friends', 'family', 'children playing', 'portrait', 'happy people',
  'woman', 'man', 'student', 'teacher', 'doctor', 'worker', 'smile',
  // food / drink
  'food', 'cooking', 'coffee', 'restaurant', 'fruit', 'baking', 'breakfast', 'vegetables', 'dessert',
  'wine', 'pizza', 'salad',
  // fitness / sports
  'fitness', 'gym workout', 'running', 'yoga', 'sports', 'soccer', 'cycling', 'swimming', 'basketball',
  'hiking', 'dance',
  // animals / science / medical
  'animals', 'wildlife', 'birds', 'dog', 'cat', 'horse', 'science', 'laboratory', 'medical', 'dna',
  'hospital', 'health', 'insect', 'ocean life',
  // industry / energy / agriculture
  'industry', 'factory', 'construction', 'energy', 'solar panels', 'wind turbine', 'agriculture',
  'farming', 'oil rig', 'warehouse', 'logistics', 'tools',
  // celebration / night / fire / smoke
  'celebration', 'fireworks', 'party', 'concert', 'night lights', 'fire', 'smoke', 'candle', 'christmas',
  'wedding', 'birthday', 'balloons',
  // luxury / fashion / cars
  'luxury', 'fashion', 'jewelry', 'cars', 'car driving', 'sports car', 'motorcycle', 'watch', 'shoes',
  'makeup',
  // gaming / creative / education
  'gaming', 'esports', 'music studio', 'art painting', 'books', 'education', 'guitar', 'camera',
  'graffiti', 'drawing',
  // misc photo-friendly
  'minimal', 'vintage', 'nature background', 'blur background', 'bokeh', 'macro', 'silhouette',
  'coffee shop', 'plant', 'sunlight',
]

// ── derive aspect bucket from width/height ──────────────────────────────────
function aspectOf(w, h) {
  if (!w || !h) return '16:9'
  const r = w / h
  if (r >= 1.25) return '16:9'
  if (r <= 0.8) return '9:16'
  return '1:1'
}

// ── one fetch with rate-limit awareness + 429 retry ─────────────────────────
async function fetchPage(q, page) {
  const p = new URLSearchParams({
    key: KEY, q, image_type: 'photo', per_page: String(PER_PAGE), page: String(page),
    safesearch: 'true', order: 'popular',
  })
  const url = `https://pixabay.com/api/?${p}`
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url)
    if (res.status === 429) {
      const reset = Number(res.headers.get('X-RateLimit-Reset')) || 30
      console.log(`   429 rate-limited — sleeping ${reset + 2}s then retrying…`)
      await sleep((reset + 2) * 1000)
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const remaining = Number(res.headers.get('X-RateLimit-Remaining'))
    const reset = Number(res.headers.get('X-RateLimit-Reset')) || 60
    const body = await res.json()
    // proactively back off when the window is nearly spent
    if (Number.isFinite(remaining) && remaining <= 5) {
      console.log(`   low quota (${remaining} left) — sleeping ${reset + 2}s to reset the window…`)
      await sleep((reset + 2) * 1000)
    }
    return body
  }
  throw new Error('exhausted 429 retries')
}

// ── main ────────────────────────────────────────────────────────────────────
const byId = new Map()   // photo_id → row (merged keyword tags across the run)
let requests = 0
const t0 = Date.now()

function flush() {
  const lines = [...byId.values()].map((r) => JSON.stringify(r)).join('\n')
  fs.writeFileSync(OUT, lines + (lines ? '\n' : ''))
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })

for (let k = 0; k < KEYWORDS.length; k++) {
  const q = KEYWORDS[k]
  let added = 0
  for (let page = 1; page <= PAGES; page++) {
    try {
      const body = await fetchPage(q, page)
      requests++
      const hits = body.hits || []
      for (const h of hits) {
        if (!h.largeImageURL) continue
        const pid = String(h.id)
        const tags = String(h.tags || '').split(',').map((t) => t.trim()).filter(Boolean)
        const existing = byId.get(pid)
        if (existing) {
          if (!existing.keywords.includes(q)) existing.keywords.push(q)
          for (const t of tags) if (!existing.keywords.includes(t)) existing.keywords.push(t)
          continue
        }
        byId.set(pid, {
          photo_id: pid,
          source: 'pixabay',
          page_url: h.pageURL || '',
          image_url: h.largeImageURL,
          width: h.imageWidth || 0,
          height: h.imageHeight || 0,
          aspect_ratio: (h.imageWidth && h.imageHeight) ? h.imageWidth / h.imageHeight : 0,
          description: h.tags || '',
          photographer: h.user || '',
          keywords: [q, ...tags],
          download_url_1920w: h.largeImageURL,
          aspect: aspectOf(h.imageWidth, h.imageHeight),
        })
        added++
      }
      // last page reached (fewer than a full page returned) — stop paging this kw
      if (hits.length < PER_PAGE) break
    } catch (e) {
      console.log(`   ! "${q}" page ${page} failed: ${e.message} — skipping`)
    }
    await sleep(THROTTLE_MS)
  }
  flush() // persist after every keyword so a crash never loses harvested rows
  console.log(`[${k + 1}/${KEYWORDS.length}] "${q}" +${added} new · unique so far: ${byId.size}`)
}

flush()
const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
const bytes = fs.existsSync(OUT) ? fs.statSync(OUT).size : 0
console.log('\n──────────────────────────────────────────────')
console.log(`DONE. unique images: ${byId.size} · requests: ${requests} · elapsed: ${elapsed}s`)
console.log(`file: ${OUT} (${(bytes / 1024 / 1024).toFixed(2)} MB)`)
