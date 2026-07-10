// ────────────────────────────────────────────────────────────────────────
// harvest-brands.mjs — harvest BRAND-name imagery/B-roll (Coca-Cola, Nike,
// iPhone, …) from Pixabay + Pexels and MERGE into the existing stock corpora,
// so brand queries resolve to real royalty-free brand stock instead of falling
// back to generic bottles. These are the same free stock sources we already
// use; how a user uses a trademark in their own video remains their call.
//
//   node scripts/harvest-brands.mjs         (keys read from ../../builder-src/env.txt or env)
//
// Loads the existing pixabay_images / pexels_images / pixabay_videos /
// pexels_videos JSONL, dedupes by id, unions keywords, and writes them back —
// never overwrites prior rows. Flushes at the end.
// ────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SD = path.join(__dirname, '..', 'stockdb')

// keys: prefer real env, else parse the builder-src/env.txt the app keeps them in
function keyFromEnvTxt(name) {
  if (process.env[name]) return process.env[name]
  for (const p of ['C:/xampp/htdocs/webai/builder-src/env.txt', path.join(__dirname, '..', '..', '..', 'builder-src', 'env.txt')]) {
    try { const m = fs.readFileSync(p, 'utf8').match(new RegExp('^' + name + '=(.+)$', 'm')); if (m) return m[1].trim() } catch { /* next */ }
  }
  return ''
}
const PIXABAY_IMG = keyFromEnvTxt('PIXABAY_KEY_IMAGES')
const PIXABAY_VID = keyFromEnvTxt('PIXABAY_KEY_VIDEOS')
const PEXELS_IMG = keyFromEnvTxt('PEXELS_KEY_IMAGES')
const PEXELS_VID = keyFromEnvTxt('PEXELS_KEY_VIDEOS')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const aspOf = (w, h) => { if (!w || !h) return '16:9'; const r = w / h; return r >= 1.25 ? '16:9' : r <= 0.8 ? '9:16' : '1:1' }
const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'with', 'for', 'to', 'is', 'at', 'by'])
const altWords = (s) => [...new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t)))]

// ── brand keyword list ──────────────────────────────────────────────────────
const BRANDS = [
  // beverages
  'coca cola', 'coca cola bottle', 'coca cola can', 'pepsi', 'sprite drink', 'fanta', 'red bull', 'monster energy',
  'gatorade', 'starbucks coffee', 'nescafe', 'heineken beer', 'budweiser', 'corona beer', 'jack daniels', 'pepsi can',
  // tech / devices
  'iphone', 'apple iphone', 'samsung galaxy', 'macbook', 'ipad', 'apple watch', 'airpods', 'playstation', 'xbox',
  'nintendo switch', 'tesla', 'tesla car', 'macbook pro', 'google pixel', 'huawei phone', 'xiaomi', 'dell laptop',
  'hp laptop', 'lenovo laptop', 'sony camera', 'gopro', 'nvidia', 'intel',
  // web / apps (usually logos/screens)
  'facebook logo', 'instagram logo', 'youtube logo', 'tiktok logo', 'netflix', 'spotify', 'whatsapp', 'twitter logo',
  'amazon package', 'paypal', 'google logo',
  // fashion / footwear
  'nike shoes', 'nike', 'adidas shoes', 'adidas', 'puma shoes', 'converse shoes', 'vans shoes', 'new balance',
  'gucci', 'louis vuitton', 'chanel', 'rolex watch', 'levis jeans', 'under armour',
  // cars / moto
  'bmw car', 'mercedes benz', 'audi car', 'toyota car', 'honda car', 'ford car', 'ferrari', 'lamborghini', 'porsche',
  'volkswagen', 'jeep', 'harley davidson', 'ford mustang',
  // food / fast food / snacks
  'mcdonalds', 'kfc', 'burger king', 'subway sandwich', 'pizza hut', 'dominos pizza', 'dunkin donuts', 'oreo',
  'nutella', 'pringles', 'doritos', 'lays chips', 'kelloggs', 'mcdonalds fries',
  // misc iconic
  'lego', 'ikea', 'disney castle', 'visa card', 'mastercard', 'shell gas station', 'starbucks cup',
]

// ── load existing corpora into maps so we MERGE, never overwrite ─────────────
function load(file, idKey) {
  const map = new Map()
  const p = path.join(SD, file)
  if (fs.existsSync(p)) for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim(); if (!t) continue
    try { const r = JSON.parse(t); map.set(String(r[idKey]), r) } catch { /* skip */ }
  }
  return map
}
const pixImg = load('pixabay_images.jsonl', 'photo_id')
const pexImg = load('pexels_images.jsonl', 'photo_id')
const pixVid = load('pixabay_videos.jsonl', 'id')
const pexVid = load('pexels_videos.jsonl', 'id')
const start = { pixImg: pixImg.size, pexImg: pexImg.size, pixVid: pixVid.size, pexVid: pexVid.size }
console.log(`Loaded existing: pixImg ${pixImg.size} · pexImg ${pexImg.size} · pixVid ${pixVid.size} · pexVid ${pexVid.size}`)

const addKw = (row, kw) => { const k = row.keywords || (row.keywords = []); if (!k.includes(kw)) k.push(kw) }

async function pixabayImages(kw) {
  if (!PIXABAY_IMG) return
  const u = `https://pixabay.com/api/?key=${PIXABAY_IMG}&q=${encodeURIComponent(kw)}&image_type=photo&per_page=200&safesearch=true&order=popular`
  const res = await fetch(u); if (!res.ok) throw new Error(`pixImg HTTP ${res.status}`)
  const b = await res.json()
  for (const h of b.hits || []) {
    const id = String(h.id); const ex = pixImg.get(id)
    if (ex) { addKw(ex, kw); continue }
    const tags = String(h.tags || '').split(',').map((t) => t.trim()).filter(Boolean)
    pixImg.set(id, { photo_id: id, source: 'pixabay', page_url: h.pageURL, image_url: h.largeImageURL, width: h.imageWidth, height: h.imageHeight, aspect_ratio: h.imageWidth / h.imageHeight, description: h.tags || '', photographer: h.user || '', keywords: [kw, ...tags], download_url_1920w: h.largeImageURL, aspect: aspOf(h.imageWidth, h.imageHeight) })
  }
}
async function pixabayVideos(kw) {
  if (!PIXABAY_VID) return
  const u = `https://pixabay.com/api/videos/?key=${PIXABAY_VID}&q=${encodeURIComponent(kw)}&per_page=150&video_type=all&safesearch=true`
  const res = await fetch(u); if (!res.ok) throw new Error(`pixVid HTTP ${res.status}`)
  const b = await res.json()
  for (const h of b.hits || []) {
    const id = String(h.id); const ex = pixVid.get(id)
    if (ex) { addKw(ex, kw); continue }
    const V = h.videos || {}; const large = V.large || V.medium || V.small || V.tiny || {}
    if (!large.url) continue
    const tags = String(h.tags || '').split(',').map((t) => t.trim()).filter(Boolean)
    pixVid.set(id, { id: h.id, keywords: [kw], tags, duration: h.duration || 0, width: large.width || 0, height: large.height || 0, url: large.url, url_medium: (V.medium || {}).url || '', url_small: (V.small || {}).url || '', url_tiny: (V.tiny || {}).url || '', thumbnail: large.thumbnail || (V.medium || {}).thumbnail || '', user: h.user || '', pageURL: h.pageURL || '', aspect: aspOf(large.width, large.height) })
  }
}
async function pexelsImages(kw) {
  if (!PEXELS_IMG) return
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(kw)}&per_page=80`, { headers: { Authorization: PEXELS_IMG } })
  if (res.status === 429) throw new Error('pexImg 429')
  if (!res.ok) throw new Error(`pexImg HTTP ${res.status}`)
  const b = await res.json()
  for (const p of b.photos || []) {
    const id = String(p.id); const ex = pexImg.get(id)
    if (ex) { addKw(ex, kw); continue }
    pexImg.set(id, { photo_id: id, source: 'pexels', page_url: p.url, image_url: p.src?.large || p.src?.medium, width: p.width, height: p.height, aspect_ratio: p.width / p.height, description: p.alt || '', photographer: p.photographer || '', keywords: [kw, ...altWords(p.alt)], download_url_1920w: p.src?.large2x || p.src?.original, aspect: aspOf(p.width, p.height) })
  }
}
async function pexelsVideos(kw) {
  if (!PEXELS_VID) return
  const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(kw)}&per_page=80`, { headers: { Authorization: PEXELS_VID } })
  if (res.status === 429) throw new Error('pexVid 429')
  if (!res.ok) throw new Error(`pexVid HTTP ${res.status}`)
  const b = await res.json()
  for (const v of b.videos || []) {
    const id = String(v.id); const ex = pexVid.get(id)
    if (ex) { addKw(ex, kw); continue }
    const mp4 = (v.video_files || []).filter((f) => f.file_type === 'video/mp4').sort((a, c) => (c.width || 0) - (a.width || 0))
    if (!mp4.length) continue
    pexVid.set(id, { id: v.id, source: 'pexels', keywords: [kw], tags: [], duration: v.duration || 0, width: v.width, height: v.height, url: mp4[0].link, url_small: (mp4[mp4.length - 1] || {}).link || '', thumbnail: v.image || '', user: v.user?.name || '', pageURL: v.url || '', aspect: aspOf(v.width, v.height) })
  }
}

function flush() {
  const w = (file, map) => fs.writeFileSync(path.join(SD, file), [...map.values()].map((r) => JSON.stringify(r)).join('\n') + '\n')
  w('pixabay_images.jsonl', pixImg); w('pexels_images.jsonl', pexImg); w('pixabay_videos.jsonl', pixVid); w('pexels_videos.jsonl', pexVid)
}

// ── run: for each brand, hit all four sources with polite throttling ─────────
const t0 = Date.now()
for (let i = 0; i < BRANDS.length; i++) {
  const kw = BRANDS[i]
  for (const [label, fn] of [['pixImg', pixabayImages], ['pixVid', pixabayVideos], ['pexImg', pexelsImages], ['pexVid', pexelsVideos]]) {
    try { await fn(kw) } catch (e) { console.log(`   ! ${label} "${kw}": ${e.message}`) }
    await sleep(700) // ~85 req/min per provider path — safe under Pixabay's 100/min
  }
  if ((i + 1) % 10 === 0) { flush(); console.log(`[${i + 1}/${BRANDS.length}] "${kw}" · pixImg ${pixImg.size} pexImg ${pexImg.size} pixVid ${pixVid.size} pexVid ${pexVid.size}`) }
}
flush()
console.log('\n──────────────────────────────────────────────')
console.log(`DONE brands in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
console.log(`pixImg ${start.pixImg}->${pixImg.size} (+${pixImg.size - start.pixImg}) · pexImg ${start.pexImg}->${pexImg.size} (+${pexImg.size - start.pexImg})`)
console.log(`pixVid ${start.pixVid}->${pixVid.size} (+${pixVid.size - start.pixVid}) · pexVid ${start.pexVid}->${pexVid.size} (+${pexVid.size - start.pexVid})`)
