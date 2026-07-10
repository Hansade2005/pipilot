// ────────────────────────────────────────────────────────────────────────
// harvest-pixabay-videos.mjs — pre-harvest a Pixabay VIDEO corpus (CDN mp4
// links across many genres) into stockdb/pixabay_videos.jsonl, so the render
// engine can drop genre-appropriate B-roll with ZERO API calls at render time.
//
//   PIXABAY_KEY=<key> node scripts/harvest-pixabay-videos.mjs
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
const OUT = path.join(__dirname, '..', 'stockdb', 'pixabay_videos.jsonl')

const PER_PAGE = 150      // Pixabay video per_page max is 200
const PAGES = 3           // up to 3 pages/keyword — pull deeper per keyword
const THROTTLE_MS = 680   // ~88 req/min — safely under the 100/60s cap
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── curated keyword list — ~110 terms spanning many genres ──────────────────
const KEYWORDS = [
  // nature / landscape / seasons
  'nature', 'forest', 'mountains', 'waterfall', 'river', 'sunset', 'sunrise', 'autumn', 'winter snow',
  'spring flowers', 'summer', 'desert', 'jungle', 'meadow', 'northern lights',
  // ocean / water
  'ocean', 'ocean waves', 'beach', 'underwater', 'coral reef', 'rain', 'water drop', 'lake',
  // sky / space / weather
  'clouds', 'timelapse clouds', 'stars', 'space', 'galaxy', 'milky way', 'storm', 'lightning',
  // city / travel / aerial
  'city', 'city night', 'city timelapse', 'traffic', 'skyline', 'aerial drone', 'drone landscape',
  'travel', 'road trip', 'highway', 'bridge', 'airport', 'train',
  // business / office / finance
  'business', 'office', 'meeting', 'handshake', 'startup', 'coworking', 'finance', 'stock market',
  'money', 'success', 'teamwork',
  // technology / ai / abstract
  'technology', 'artificial intelligence', 'data', 'network', 'code programming', 'server room',
  'robot', 'circuit', 'abstract', 'abstract background', 'particles', 'digital', 'hologram', 'neon',
  // people / lifestyle
  'people', 'crowd', 'walking', 'friends', 'family', 'children playing', 'portrait', 'happy people',
  // food / drink
  'food', 'cooking', 'coffee', 'restaurant', 'fruit', 'baking',
  // fitness / sports
  'fitness', 'gym workout', 'running', 'yoga', 'sports', 'soccer', 'cycling', 'swimming',
  // animals / science / medical
  'animals', 'wildlife', 'birds', 'dog', 'cat', 'science', 'laboratory', 'medical', 'dna', 'hospital',
  // industry / energy / agriculture
  'industry', 'factory', 'construction', 'energy', 'solar panels', 'wind turbine', 'agriculture',
  'farming', 'oil rig',
  // celebration / night / fire / smoke
  'celebration', 'fireworks', 'party', 'concert', 'night lights', 'fire', 'smoke', 'candle',
  // luxury / fashion / cars
  'luxury', 'fashion', 'jewelry', 'cars', 'car driving', 'sports car', 'motorcycle',
  // gaming / creative
  'gaming', 'esports', 'music studio', 'art painting',

  // ── expansion round: ~200 long-tail / genre terms not well covered above ──
  // tech / data / dev (fine-grained)
  'data center', 'server racks', 'circuit board macro', 'developer typing keyboard',
  'coding screen', 'software development', 'cloud computing', 'cybersecurity', 'binary code',
  'motherboard closeup', 'fiber optics', 'blockchain', 'cryptocurrency', 'bitcoin', 'stock chart',
  'trading screen', 'graph chart animation', 'big data', 'machine learning', 'virtual reality',
  'augmented reality', 'drone flying', 'satellite orbit', 'rocket launch', '3d printing',
  'semiconductor', 'quantum computing', 'wifi signal', 'smartphone screen', 'laptop working',
  // energy / green / infrastructure
  'electric car charging', 'wind farm aerial', 'solar farm', 'power lines', 'nuclear plant',
  'hydroelectric dam', 'oil refinery', 'battery technology', 'recycling', 'water treatment',
  'geothermal', 'coal power plant', 'electric grid',
  // city / urban / night
  'city rain night', 'neon signs', 'times square', 'tokyo street', 'subway train', 'metro station',
  'city crosswalk', 'skyscraper', 'urban timelapse', 'street food', 'graffiti wall', 'city fog',
  'downtown night', 'crosswalk aerial', 'parking garage', 'urban decay',
  // nature / weather (fine-grained)
  'forest fog', 'snow falling', 'autumn leaves falling', 'cherry blossom', 'lavender field',
  'wheat field', 'rice terraces', 'volcano eruption', 'iceberg', 'glacier', 'canyon',
  'sand dunes', 'rainforest', 'bamboo forest', 'foggy mountains', 'moss forest', 'dew drops',
  'thunderstorm', 'tornado', 'hail', 'frost', 'melting ice', 'waterfall closeup', 'mountain timelapse',
  // ocean / water (fine-grained)
  'ocean aerial', 'waves slow motion', 'surfing', 'scuba diving', 'jellyfish', 'dolphins',
  'whale', 'sharks', 'sea turtle', 'tropical beach', 'boat sailing', 'harbor', 'lighthouse',
  'fishing boat', 'kayaking', 'river rafting',
  // food / drink (fine-grained)
  'coffee pour', 'espresso machine', 'latte art', 'pizza baking', 'sushi', 'burger',
  'pouring wine', 'cocktail', 'chocolate melting', 'ice cream', 'barista', 'farmers market',
  'grilling bbq', 'salad fresh', 'bread baking', 'tea pouring', 'honey dripping', 'pancakes',
  // people / work / lifestyle
  'team meeting office', 'brainstorming', 'presentation', 'video call', 'remote work',
  'coworking space', 'entrepreneur', 'designer working', 'architect blueprint', 'call center',
  'nurse patient', 'doctor surgery', 'teacher classroom', 'student studying', 'graduation',
  'yoga meditation', 'people commuting', 'shopping mall', 'grocery shopping', 'online shopping',
  'delivery courier', 'warehouse logistics', 'forklift warehouse', 'assembly line',
  // industry / build
  'construction crane', 'welding sparks', 'robot arm factory', 'cnc machine', 'steel factory',
  'car manufacturing', 'textile factory', 'mining', 'excavator', 'bulldozer', 'road construction',
  'bricklaying', 'scaffolding', 'demolition',
  // transport / travel
  'airplane takeoff', 'airplane landing', 'jet engine', 'helicopter', 'cargo ship',
  'container port', 'freight train', 'high speed train', 'truck highway', 'traffic timelapse',
  'roundabout aerial', 'toll booth', 'gas station', 'road trip desert', 'mountain road',
  // health / science / medical
  'science lab microscope', 'test tubes', 'petri dish', 'dna helix', 'vaccine syringe',
  'heartbeat monitor', 'x ray', 'mri scan', 'brain scan', 'pills medication', 'blood cells',
  'surgery operating room', 'physical therapy', 'dentist',
  // agriculture / farm
  'farm tractor', 'harvesting crops', 'vineyard', 'greenhouse', 'cattle farm', 'sheep herd',
  'chicken farm', 'corn field', 'orchard', 'irrigation', 'beekeeping', 'plowing field',
  // nature / animals (fine-grained)
  'lion', 'elephant', 'tiger', 'wolf', 'deer', 'eagle', 'owl', 'butterfly', 'bees flowers',
  'penguins', 'polar bear', 'horses running', 'flock of birds', 'aquarium fish', 'monkey',
  // celebration / emotion / fire
  'campfire night', 'bonfire', 'fireplace', 'sparklers', 'wedding', 'birthday party',
  'new year celebration', 'confetti', 'balloons', 'christmas lights', 'halloween', 'diwali',
  'lantern festival', 'protest crowd', 'stadium crowd',
  // abstract / motion / background
  'ink in water', 'paint splash', 'liquid gold', 'bokeh lights', 'light streaks', 'glitch effect',
  'geometric loop', 'plexus network', 'smoke abstract', 'kaleidoscope', 'fractal', 'wireframe globe',
  'data stream', 'matrix code', 'gradient waves', 'dust particles',
  // interior / architecture
  'modern kitchen', 'living room interior', 'empty office', 'hotel lobby', 'staircase spiral',
  'glass building', 'library interior', 'museum', 'church interior', 'warehouse interior',
  'rain window', 'window curtains',
  // lifestyle / fashion / beauty
  'makeup application', 'perfume', 'hair salon', 'spa massage', 'manicure', 'runway fashion',
  'jewelry closeup', 'watch closeup', 'shopping bags', 'luxury hotel', 'private jet interior',
]

// ── derive aspect bucket from primary (large) width/height ──────────────────
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
    key: KEY, q, per_page: String(PER_PAGE), page: String(page),
    video_type: 'all', safesearch: 'true',
  })
  const url = `https://pixabay.com/api/videos/?${p}`
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
        const V = h.videos || {}
        const large = V.large || V.medium || V.small || V.tiny || {}
        if (!large.url) continue
        const existing = byId.get(h.id)
        if (existing) {
          if (!existing.keywords.includes(q)) existing.keywords.push(q)
          continue
        }
        byId.set(h.id, {
          id: h.id,
          keywords: [q],
          tags: String(h.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
          duration: h.duration || 0,
          width: large.width || 0,
          height: large.height || 0,
          url: large.url,
          url_medium: (V.medium || {}).url || '',
          url_small: (V.small || {}).url || '',
          url_tiny: (V.tiny || {}).url || '',
          thumbnail: large.thumbnail || (V.medium || {}).thumbnail || '',
          user: h.user || '',
          pageURL: h.pageURL || '',
          aspect: aspectOf(large.width, large.height),
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
console.log(`DONE. unique videos: ${byId.size} (seeded ${seededCount}, +${byId.size - seededCount} new) · keywords: ${KEYWORDS.length} · requests: ${requests} · elapsed: ${elapsed}s`)
console.log(`file: ${OUT} (${(bytes / 1024 / 1024).toFixed(2)} MB)`)
