// ────────────────────────────────────────────────────────────────────────
// harvest-jamendo-music.mjs — GROW the baked-in Jamendo MUSIC corpus at
// stockdb/jamendo_moodtheme.jsonl with more real, streamable tracks across a
// broad mood/theme vocabulary, so the render engine's pickMusic() has a deep
// pool to score against — with ZERO API calls at render time.
//
//   node scripts/harvest-jamendo-music.mjs
//
// Uses the Jamendo API v3.0 /tracks endpoint (public client_id). Each output
// row holds ONLY public CDN links + metadata, safe to commit. The existing
// corpus is LOADED and MERGED first: dedupe by numeric_id, union the `moods`
// arrays — no existing track is ever lost or duplicated.
//
// Robustness (modeled on harvest-pixabay-videos.mjs): throttle politely,
// back off on 429 / non-200, one bad request is logged and skipped (never
// aborts the run), and the corpus is FLUSHED after every mood so a crash
// mid-run never loses harvested rows.
// ────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CLIENT_ID = '3efca530'                 // public Jamendo API client_id
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'stockdb', 'jamendo_moodtheme.jsonl')

const LIMIT = 200          // Jamendo tracks per_page max
const PAGES = 5            // up to 5 pages (1000 tracks) per mood
const THROTTLE_MS = 320    // ~3 req/s — polite
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── MOOD vocabulary: the distinct moods already present in the corpus PLUS the
// standard Jamendo mood/theme tags requested. Deduped, order-preserving. ─────
const EXISTING_MOODS = [
  'happy', 'film', 'energetic', 'relaxing', 'emotional', 'melodic', 'dark', 'epic',
  'dream', 'love', 'inspiring', 'sad', 'meditative', 'uplifting', 'advertising',
  'deep', 'motivational', 'romantic', 'christmas', 'documentary', 'corporate',
  'positive', 'summer', 'space', 'background', 'soundscape', 'fun', 'soft',
  'ambiental', 'calm', 'children', 'adventure', 'upbeat', 'melancholic', 'slow',
  'commercial', 'drama', 'movie', 'action', 'ballad', 'dramatic', 'sport',
  'trailer', 'party', 'game', 'nature', 'cool', 'powerful', 'hopeful', 'retro',
  'funny', 'groovy', 'holiday', 'travel', 'horror', 'heavy', 'mellow', 'sexy', 'fast',
]
const REQUESTED_MOODS = [
  'happy', 'sad', 'relaxing', 'energetic', 'emotional', 'epic', 'film', 'corporate',
  'inspiring', 'uplifting', 'motivational', 'dark', 'dramatic', 'calm', 'upbeat',
  'background', 'ambient', 'chill', 'romantic', 'melancholic', 'hopeful', 'powerful',
  'groovy', 'dreamy', 'funky', 'aggressive', 'mellow', 'cinematic', 'meditative',
  'soundtrack', 'positive', 'love', 'party', 'retro', 'electronic', 'acoustic',
  'orchestral',
]
const MOODS = [...new Set([...EXISTING_MOODS, ...REQUESTED_MOODS])]

// ── id helpers — MATCH the existing schema exactly ──────────────────────────
const trackId  = (id) => 'track_' + String(id).padStart(7, '0')      // 948 -> track_0000948
const artistId = (id) => (id ? 'artist_' + String(id).padStart(6, '0') : '')
const albumId  = (id) => (id ? 'album_'  + String(id).padStart(6, '0') : '')
const pathOf   = (id) => String(Number(id) % 100).padStart(2, '0') + '/' + id + '.mp3'  // 948 -> 48/948.mp3

// ── one fetch with 429 / non-200 back-off + retry ───────────────────────────
async function fetchPage(fuzzytags, offset) {
  const p = new URLSearchParams({
    client_id: CLIENT_ID, format: 'json', limit: String(LIMIT), offset: String(offset),
    fuzzytags, include: 'musicinfo', audioformat: 'mp32', order: 'popularity_total',
  })
  const url = `https://api.jamendo.com/v3.0/tracks/?${p}`
  for (let attempt = 0; attempt < 4; attempt++) {
    let res
    try { res = await fetch(url) } catch (e) {
      console.log(`   fetch error (${e.message}) — backing off ${(attempt + 1) * 3}s`)
      await sleep((attempt + 1) * 3000); continue
    }
    if (res.status === 429) {
      const wait = 15 * (attempt + 1)
      console.log(`   429 rate-limited — sleeping ${wait}s then retrying…`)
      await sleep(wait * 1000); continue
    }
    if (!res.ok) {
      console.log(`   HTTP ${res.status} — backing off ${(attempt + 1) * 3}s`)
      await sleep((attempt + 1) * 3000); continue
    }
    const body = await res.json()
    const h = body.headers || {}
    if (h.status !== 'success') throw new Error(`api status ${h.status}: ${h.error_message || ''}`)
    return body.results || []
  }
  throw new Error('exhausted retries')
}

// ── load + MERGE existing corpus (dedupe by numeric_id, union moods) ─────────
const byId = new Map()   // numeric_id -> row
let startCount = 0
if (fs.existsSync(OUT)) {
  const lines = fs.readFileSync(OUT, 'utf8').split('\n')
  for (const line of lines) {
    const s = line.trim(); if (!s) continue
    try {
      const r = JSON.parse(s)
      if (r && Number.isFinite(r.numeric_id)) { byId.set(r.numeric_id, r); startCount++ }
    } catch { /* skip malformed line */ }
  }
}
console.log(`loaded ${startCount} existing tracks from ${path.basename(OUT)}`)

function flush() {
  const lines = [...byId.values()].map((r) => JSON.stringify(r)).join('\n')
  fs.writeFileSync(OUT, lines + (lines ? '\n' : ''))
}

// ── merge one API track under a queried mood ────────────────────────────────
function ingest(t, queriedMood) {
  const id = Number(t.id)
  if (!Number.isFinite(id) || id <= 0) return false
  // real Jamendo mood/theme tags for this track + the mood it was queried under
  const vartags = ((t.musicinfo && t.musicinfo.tags && t.musicinfo.tags.vartags) || [])
    .map((x) => String(x).toLowerCase().trim()).filter(Boolean)
  const moods = [...new Set([queriedMood, ...vartags])]

  const existing = byId.get(id)
  if (existing) {
    const merged = new Set([...(existing.moods || []), ...moods])
    existing.moods = [...merged]
    return false   // not a NEW track
  }
  byId.set(id, {
    track_id: trackId(id),
    numeric_id: id,
    artist_id: artistId(t.artist_id),
    album_id: albumId(t.album_id),
    path: pathOf(id),
    duration_sec: Number(t.duration) || 0,
    moods,
    mp3_url: `https://mp3d.jamendo.com/download/track/${id}/mp32/`,
    stream_url: `https://mp3d.jamendo.com/download/track/${id}/mp31/`,
    page_url: `https://www.jamendo.com/track/${id}`,
  })
  return true      // NEW track
}

// ── main ─────────────────────────────────────────────────────────────────────
const t0 = Date.now()
let requests = 0
let totalNew = 0

for (let m = 0; m < MOODS.length; m++) {
  const mood = MOODS[m]
  let added = 0
  for (let page = 0; page < PAGES; page++) {
    const offset = page * LIMIT
    let results
    try {
      results = await fetchPage(mood, offset)
      requests++
    } catch (e) {
      console.log(`   ! "${mood}" offset ${offset} failed: ${e.message} — skipping page`)
      await sleep(THROTTLE_MS)
      continue
    }
    for (const t of results) if (ingest(t, mood)) added++
    if (results.length < LIMIT) break   // last page for this mood
    await sleep(THROTTLE_MS)
  }
  totalNew += added
  flush()  // persist after every mood so a crash never loses harvested rows
  console.log(`[${m + 1}/${MOODS.length}] "${mood}" +${added} new · total unique: ${byId.size}`)
  await sleep(THROTTLE_MS)
}

flush()
const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
const bytes = fs.existsSync(OUT) ? fs.statSync(OUT).size : 0
console.log('\n──────────────────────────────────────────────')
console.log(`DONE. start: ${startCount} · final: ${byId.size} · new: ${byId.size - startCount}`)
console.log(`moods covered: ${MOODS.length} · requests: ${requests} · elapsed: ${elapsed}s`)
console.log(`file: ${OUT} (${(bytes / 1024 / 1024).toFixed(2)} MB)`)
