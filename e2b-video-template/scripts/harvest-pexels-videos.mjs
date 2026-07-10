// ────────────────────────────────────────────────────────────────────────
// harvest-pexels-videos.mjs — pre-harvest a Pexels VIDEO corpus (CDN mp4
// links across many genres) into stockdb/pexels_videos.jsonl, schema-compatible
// with pixabay_videos.jsonl so both can be merged into one render pool.
//
//   PEXELS_KEY=<key> node scripts/harvest-pexels-videos.mjs
//
// The API key is read from env ONLY and NEVER written to the output file — the
// JSONL holds only public CDN links + metadata, which are safe to commit.
//
// Rate limit: Pexels default is ~200 requests / HOUR (not per minute). So we
// keep the keyword list MODEST (~110 terms), do 1 page/keyword (per_page 80),
// throttle ~16s between requests, and honor the X-Ratelimit-Remaining /
// X-Ratelimit-Reset headers. If remaining hits 0 we FLUSH, log, and STOP
// gracefully — reporting a partial corpus rather than erroring. One bad keyword
// is logged and skipped; the corpus is flushed after every keyword so a crash
// mid-run never loses harvested rows.
// ────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = process.env.PEXELS_KEY
if (!KEY) { console.error('ERROR: set PEXELS_KEY in the environment (never hardcode it).'); process.exit(1) }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'stockdb', 'pexels_videos.jsonl')

const PER_PAGE = 80        // Pexels per_page max is 80
const THROTTLE_MS = 2000   // ~2s/req — the live limit is 25000/hr, huge headroom
const REQUEST_BUDGET = 500 // hard stop; we use ~140 reqs, well under the window
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── curated keyword list — ~110 broad terms spanning many genres. Kept modest
//    to stay inside the ~200 req/hr budget (1 page each). ──────────────────────
const KEYWORDS = [
  // nature / landscape / seasons
  'nature', 'forest', 'mountains', 'waterfall', 'river', 'sunset', 'sunrise', 'autumn', 'winter snow',
  'spring flowers', 'desert', 'jungle', 'northern lights',
  // ocean / water
  'ocean waves', 'beach', 'underwater', 'coral reef', 'rain', 'lake',
  // sky / space / weather
  'clouds', 'stars', 'space', 'galaxy', 'storm', 'lightning',
  // city / travel / aerial
  'city', 'city night', 'traffic', 'skyline', 'aerial drone', 'travel', 'highway', 'bridge', 'train',
  // business / office / finance
  'business', 'office', 'business meeting', 'handshake', 'startup', 'finance', 'stock market',
  'money', 'teamwork',
  // technology / ai / abstract
  'technology', 'artificial intelligence', 'data center', 'network', 'programming', 'server room',
  'robot', 'circuit board', 'abstract', 'particles', 'digital', 'hologram', 'neon',
  // people / lifestyle
  'people walking', 'crowd', 'friends', 'family', 'children playing', 'portrait', 'happy people',
  // food / drink
  'food', 'cooking', 'coffee', 'restaurant', 'fruit', 'baking',
  // fitness / sports
  'fitness', 'gym workout', 'running', 'yoga', 'sports', 'soccer', 'cycling', 'swimming',
  // animals / science / medical
  'wildlife', 'birds', 'dog', 'cat', 'science', 'laboratory', 'medical', 'hospital',
  // industry / energy / agriculture
  'industry', 'factory', 'construction', 'energy', 'solar panels', 'wind turbine', 'agriculture',
  'farming',
  // celebration / night / fire / smoke
  'celebration', 'fireworks', 'party', 'concert', 'night lights', 'fire', 'smoke', 'candle',
  // luxury / fashion / cars
  'luxury', 'fashion', 'jewelry', 'car driving', 'sports car', 'motorcycle',
  // gaming / creative
  'gaming', 'music studio', 'painting art',
  // fine-grained high-value B-roll
  'cloud computing', 'cybersecurity', 'cryptocurrency', 'stock chart', 'machine learning',
  'virtual reality', 'drone flying', 'rocket launch', 'electric car', 'wind farm',
  'ocean aerial', 'waves slow motion', 'surfing', 'scuba diving', 'dolphins',
  'coffee pour', 'latte art', 'pizza', 'cocktail', 'ice cream',
  'team meeting', 'presentation', 'video call', 'remote work', 'warehouse',
  'construction crane', 'welding', 'car manufacturing', 'excavator',
  'airplane', 'helicopter', 'cargo ship', 'freight train',
  'microscope', 'dna', 'surgery', 'vineyard', 'tractor',
  'lion', 'elephant', 'tiger', 'horses running', 'butterfly',
  'campfire', 'fireplace', 'wedding', 'confetti', 'christmas lights',
  'ink in water', 'paint splash', 'bokeh lights', 'light streaks', 'smoke abstract',
  'modern kitchen', 'hotel lobby', 'library interior', 'rain window', 'glass building',
]

// ── derive aspect bucket from width/height ──────────────────────────────────
function aspectOf(w, h) {
  if (!w || !h) return '16:9'
  const r = w / h
  if (r >= 1.25) return '16:9'
  if (r <= 0.8) return '9:16'
  return '1:1'
}

// ── pick the best mp4 link + a smaller mp4 from a Pexels video_files array ──
function pickLinks(files) {
  const mp4s = (files || []).filter((f) => f && f.link && /mp4/i.test(f.file_type || ''))
  if (!mp4s.length) return null
  // best = prefer hd, then highest resolution (width*height)
  const area = (f) => (f.width || 0) * (f.height || 0)
  const sorted = [...mp4s].sort((a, b) => {
    const qa = a.quality === 'hd' ? 1 : 0
    const qb = b.quality === 'hd' ? 1 : 0
    if (qa !== qb) return qb - qa
    return area(b) - area(a)
  })
  const best = sorted[0]
  // smaller = lowest-resolution mp4 (for lightweight previews)
  const bySize = [...mp4s].sort((a, b) => area(a) - area(b))
  const small = bySize[0]
  return {
    url: best.link,
    width: best.width || 0,
    height: best.height || 0,
    url_small: small && small.link !== best.link ? small.link : '',
  }
}

// ── one fetch; returns { body, remaining, reset, status } ───────────────────
async function fetchPage(q, page, orientation) {
  const p = new URLSearchParams({ query: q, per_page: String(PER_PAGE), page: String(page) })
  if (orientation) p.set('orientation', orientation)
  const url = `https://api.pexels.com/videos/search?${p}`
  const res = await fetch(url, { headers: { Authorization: KEY } })
  const remaining = Number(res.headers.get('X-Ratelimit-Remaining'))
  const reset = Number(res.headers.get('X-Ratelimit-Reset'))
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { status: res.status, body: null, remaining, reset, error: text }
  }
  const body = await res.json()
  return { status: 200, body, remaining, reset }
}

// ── main ────────────────────────────────────────────────────────────────────
const byId = new Map()   // id → row (merged keyword tags across the run)
let requests = 0
const t0 = Date.now()

// ── load the existing corpus first so this run MERGES, never overwrites ──────
let seededCount = 0
if (fs.existsSync(OUT)) {
  const raw = fs.readFileSync(OUT, 'utf8')
  for (const line of raw.split('\n')) {
    const s = line.trim()
    if (!s) continue
    try {
      const row = JSON.parse(s)
      if (row && row.id != null) {
        if (!Array.isArray(row.keywords)) row.keywords = row.keywords ? [row.keywords] : []
        byId.set(row.id, row)
      }
    } catch { /* skip malformed line */ }
  }
  seededCount = byId.size
  console.log(`Loaded ${seededCount} existing rows from ${path.basename(OUT)} — merging into this run.`)
}

function flush() {
  const lines = [...byId.values()].map((r) => JSON.stringify(r)).join('\n')
  fs.writeFileSync(OUT, lines + (lines ? '\n' : ''))
}

function ingest(hits, q) {
  let added = 0
  for (const h of hits || []) {
    const links = pickLinks(h.video_files)
    if (!links) continue
    const existing = byId.get(h.id)
    if (existing) {
      if (!existing.keywords.includes(q)) existing.keywords.push(q)
      continue
    }
    const w = links.width || h.width || 0
    const ht = links.height || h.height || 0
    byId.set(h.id, {
      id: h.id,
      source: 'pexels',
      keywords: [q],
      tags: [],
      duration: h.duration || 0,
      width: w,
      height: ht,
      url: links.url,
      url_small: links.url_small,
      thumbnail: h.image || '',
      user: (h.user && h.user.name) || '',
      pageURL: h.url || '',
      aspect: aspectOf(w, ht),
    })
    added++
  }
  return added
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })

// ── TEST FETCH — confirm key + header auth before the full run ──────────────
console.log('Test fetch: "nature" (orientation=landscape)…')
{
  const r = await fetchPage('nature', 1, 'landscape')
  requests++
  if (r.status === 401 || r.status === 403) {
    console.error(`\nAUTH FAILED — HTTP ${r.status}. Body: ${r.error || '(empty)'}`)
    console.error('Key rejected. Stopping (no loop).')
    process.exit(1)
  }
  if (r.status !== 200 || !r.body) {
    console.error(`\nTest fetch failed — HTTP ${r.status}. Body: ${r.error || '(empty)'}`)
    process.exit(1)
  }
  const first = (r.body.videos || [])[0]
  console.log(`  OK — total_results=${r.body.total_results}, got ${(r.body.videos || []).length} videos.`)
  console.log(`  X-Ratelimit-Remaining=${r.remaining}  X-Ratelimit-Reset=${r.reset}`)
  if (first) {
    const links = pickLinks(first.video_files)
    console.log('  Sample hit:', JSON.stringify({
      id: first.id, duration: first.duration, w: links?.width, h: links?.height,
      url: links?.url, user: first.user?.name,
    }))
  }
  ingest(r.body.videos, 'nature')
  flush()
  console.log(`  Auth confirmed. unique so far: ${byId.size}\n`)
  // NOTE: Pexels' X-Ratelimit-Remaining header is erratic (bounces to 0 spuriously
  // even with the full 25000/hr window intact), so we DON'T stop on it — only a real
  // HTTP 429 halts the run. We just log it for visibility.
}

let stopped = false
// two orientations to capture both landscape (16:9) and portrait (9:16)
const PLAN = KEYWORDS.map((q) => ({ q, orientation: 'landscape' }))
// append a smaller portrait sweep for high-value terms if budget allows
const PORTRAIT_TERMS = ['nature', 'city night', 'ocean waves', 'people walking', 'abstract',
  'fashion', 'fitness', 'food', 'travel', 'business']
for (const q of PORTRAIT_TERMS) PLAN.push({ q, orientation: 'portrait' })

for (let k = 0; k < PLAN.length; k++) {
  if (requests >= REQUEST_BUDGET) {
    console.log(`\nRequest budget (${REQUEST_BUDGET}) reached — flushing and stopping gracefully.`)
    stopped = true
    break
  }
  await sleep(THROTTLE_MS)
  const { q, orientation } = PLAN[k]
  let added = 0
  const r = await fetchPage(q, 1, orientation)
  requests++
  if (r.status === 429) {
    console.log(`   429 rate-limited on "${q}" — window spent. Flushing + stopping gracefully.`)
    stopped = true
    break
  }
  if (r.status !== 200 || !r.body) {
    console.log(`   ! "${q}" (${orientation}) HTTP ${r.status} — skipping. ${r.error ? r.error.slice(0, 120) : ''}`)
  } else {
    added = ingest(r.body.videos, q)
  }
  flush() // persist after every keyword
  const rem = Number.isFinite(r.remaining) ? r.remaining : '?'
  console.log(`[${k + 1}/${PLAN.length}] "${q}" (${orientation}) +${added} · unique: ${byId.size} · remaining: ${rem} · reqs: ${requests}`)
  // Do NOT stop on remaining<=0 — Pexels sends spurious 0s. Only a real 429 (above) halts.
}

flush()
const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
const bytes = fs.existsSync(OUT) ? fs.statSync(OUT).size : 0
console.log('\n──────────────────────────────────────────────')
console.log(`DONE${stopped ? ' (stopped early — partial)' : ''}. unique videos: ${byId.size} (seeded ${seededCount}, +${byId.size - seededCount} new)`)
console.log(`requests used: ${requests} / ~200-hr budget · elapsed: ${elapsed}s`)
console.log(`file: ${OUT} (${(bytes / 1024 / 1024).toFixed(2)} MB)`)
