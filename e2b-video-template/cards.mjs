// ── Template cards — "Kinetic Type Cards" ────────────────────────────────────
// Professionally designed, animated canvas cards the AGENT drives by CONTENT, not
// raw HTML. Each template owns a DISTINCT display face (so a video's cards never look
// samey) and ONE signature swift entrance (~0.6s, cubic-bezier(.2,.8,.2,1)); colors
// come from the video theme so the deck stays on-brand. Rendered by cardSeg (which
// waits for the web font to load, so the characterful type actually paints).
//
// Usage from the storyboard: { kind:"card", template:"stat", dur, say, data:{…} }.
// The engine calls cardHtml(scene, resolvedTheme, {W,H}) → full HTML for Playwright.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]))
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v])
// A Google-Fonts stylesheet link for one family + weights (italic variants included where asked).
const gf = (family, spec) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, '+')}${spec ? ':' + spec : ''}&display=swap">`
// The body/utility faces are shared so DISPLAY faces do the differentiating.
const BODY = `'Inter','Inter Tight',system-ui,sans-serif`
const MONO = `'JetBrains Mono',ui-monospace,monospace`
const bodyLink = gf('Inter', 'wght@400;500;600;700')
const monoLink = gf('JetBrains Mono', 'wght@400;500;700')

// Shared keyframes every template can lean on.
const KF = `
@keyframes clipUp{from{clip-path:inset(105% 0 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes rise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
@keyframes riseS{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes drawX{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes drawY{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes pop{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:scale(1)}}
@keyframes inL{from{opacity:0;transform:translateX(-46px)}to{opacity:1;transform:none}}
@keyframes inR{from{opacity:0;transform:translateX(46px)}to{opacity:1;transform:none}}
@keyframes wipeL{from{opacity:0;clip-path:inset(0 100% 0 0)}to{opacity:1;clip-path:inset(0 0 0 0)}}
@keyframes glow{0%,100%{box-shadow:0 0 0 0 var(--acc-a)}50%{box-shadow:0 0 34px 2px var(--acc-a)}}
@keyframes nudge{0%,100%{transform:translateX(0)}50%{transform:translateX(6px)}}`
const EASE = 'cubic-bezier(.2,.8,.2,1)'

// ── individual templates — each returns { fonts, css, body } ──────────────────
const T = {
  // Hero metric: one big number owns the frame.
  stat(d, c) {
    const delta = d.delta ? `<span class="dl ${String(d.deltaDir || 'up') === 'down' ? 'dn' : 'up'}">${esc(d.delta)}</span>` : ''
    return {
      fonts: gf('Sora', 'wght@500;700;800'),
      css: `
        .st{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.5em;text-align:center;padding:0 8%}
        .st .lab{font-family:${BODY};font-weight:600;font-size:1.15em;letter-spacing:.22em;text-transform:uppercase;color:var(--sub);opacity:0;animation:riseS .6s .05s ${EASE} forwards}
        .st .val{font-family:'Sora',${BODY};font-weight:800;font-size:8.2em;line-height:.92;letter-spacing:-.03em;color:var(--text);animation:clipUp .7s .18s ${EASE} both}
        .st .val em{font-style:normal;color:var(--accent)}
        .st .rule{width:2.4em;height:.14em;border-radius:99px;background:var(--accent);transform-origin:center;animation:drawX .6s .5s ${EASE} both}
        .st .unit{font-family:'Sora',${BODY};font-weight:500;font-size:1.5em;color:var(--sub);opacity:0;animation:riseS .6s .6s ${EASE} forwards}
        .st .dl{margin-top:.2em;font-family:${MONO};font-weight:500;font-size:1em;padding:.3em .7em;border-radius:99px;opacity:0;animation:pop .5s .72s ${EASE} forwards}
        .st .dl.up{color:#16a34a;background:rgba(22,163,74,.14)} .st .dl.dn{color:#dc2626;background:rgba(220,38,38,.14)}`,
      body: `<div class="st">
        ${d.label ? `<div class="lab">${esc(d.label)}</div>` : ''}
        <div class="val">${esc(d.value)}</div>
        <div class="rule"></div>
        ${d.unit ? `<div class="unit">${esc(d.unit)}</div>` : ''}
        ${delta}
      </div>`,
    }
  },

  // A vs B — two columns, a dividing line, a highlighted winner.
  compare(d, c) {
    const L = d.left || {}, R = d.right || {}, win = d.winner
    const col = (x, side) => `<div class="col ${side}${win === side ? ' win' : ''}">
      ${x.title ? `<div class="ct">${esc(x.title)}</div>` : ''}
      <div class="cv">${esc(x.value ?? '')}</div>
      ${x.note ? `<div class="cn">${esc(x.note)}</div>` : ''}</div>`
    return {
      fonts: gf('Space Grotesk', 'wght@500;600;700'),
      css: `
        .cmp{position:fixed;inset:0;display:flex;align-items:stretch;justify-content:center;padding:9% 6%}
        .cmp .col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.35em;text-align:center;padding:0 4%}
        .cmp .col.left{animation:inL .6s .12s ${EASE} both} .cmp .col.right{animation:inR .6s .12s ${EASE} both}
        .cmp .ct{font-family:${BODY};font-weight:600;font-size:1.1em;letter-spacing:.14em;text-transform:uppercase;color:var(--sub)}
        .cmp .cv{font-family:'Space Grotesk',${BODY};font-weight:700;font-size:4.4em;line-height:1;letter-spacing:-.02em;color:var(--text)}
        .cmp .cn{font-family:${BODY};font-weight:500;font-size:1.15em;color:var(--sub)}
        .cmp .win .cv{color:var(--accent);animation:pop .5s .7s ${EASE} both}
        .cmp .win .ct{color:var(--accent)}
        .cmp .mid{position:relative;width:0;display:flex;align-items:center;justify-content:center}
        .cmp .line{position:absolute;top:6%;bottom:6%;width:2px;background:linear-gradient(var(--sub),transparent,var(--sub));opacity:.4;transform-origin:top;animation:drawY .7s .25s ${EASE} both}
        .cmp .vs{font-family:'Space Grotesk',${BODY};font-weight:700;font-size:1.5em;color:var(--text);background:var(--bg);border:2px solid var(--accent);border-radius:99px;width:2.2em;height:2.2em;display:grid;place-items:center;opacity:0;animation:pop .5s .55s ${EASE} forwards}`,
      body: `<div class="cmp">${col(L, 'left')}<div class="mid"><div class="line"></div><div class="vs">vs</div></div>${col(R, 'right')}</div>`,
    }
  },

  // Heading + a short list; each point wipes in with a drawing marker.
  bullets(d, c) {
    const items = arr(d.points).slice(0, 6)
    const li = (p, i) => `<li style="animation-delay:${(0.35 + i * 0.11).toFixed(2)}s"><span class="mk"></span><span class="tx">${esc(p)}</span></li>`
    return {
      fonts: gf('Bricolage Grotesque', 'opsz,wght@12..48,600;12..48,700'),
      css: `
        .bl{position:fixed;inset:0;display:flex;flex-direction:column;justify-content:center;gap:.6em;padding:0 10%}
        .bl .eb{font-family:${MONO};font-weight:500;font-size:1em;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);opacity:0;animation:riseS .5s .05s ${EASE} forwards}
        .bl h1{margin:0;font-family:'Bricolage Grotesque',${BODY};font-weight:700;font-size:3.4em;line-height:1.02;letter-spacing:-.02em;color:var(--text);opacity:0;animation:rise .6s .12s ${EASE} forwards}
        .bl ul{list-style:none;margin:.4em 0 0;padding:0;display:flex;flex-direction:column;gap:.5em}
        .bl li{display:flex;align-items:center;gap:.6em;font-family:${BODY};font-weight:500;font-size:1.7em;color:var(--text);opacity:0;animation:wipeL .55s ${EASE} forwards}
        .bl .mk{flex:none;width:.5em;height:.5em;border-radius:3px;background:var(--accent);transform:rotate(45deg)}`,
      body: `<div class="bl">${d.eyebrow ? `<div class="eb">${esc(d.eyebrow)}</div>` : ''}${d.heading ? `<h1>${esc(d.heading)}</h1>` : ''}<ul>${items.map(li).join('')}</ul></div>`,
    }
  },

  // Pull quote / testimonial — serif display, oversized punctuation.
  quote(d, c) {
    return {
      fonts: gf('Fraunces', 'ital,opsz,wght@1,9..144,500;1,9..144,600'),
      css: `
        .qt{position:fixed;inset:0;display:flex;flex-direction:column;justify-content:center;gap:.5em;padding:0 11%}
        .qt .mark{font-family:'Fraunces',serif;font-style:italic;font-weight:600;font-size:7em;line-height:.6;color:var(--accent);opacity:0;transform-origin:left;animation:pop .5s .05s ${EASE} forwards}
        .qt blockquote{margin:0;font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:3.1em;line-height:1.18;letter-spacing:-.01em;color:var(--text);clip-path:inset(0 100% 0 0);animation:wipeL .8s .25s ${EASE} both}
        .qt .att{display:flex;align-items:center;gap:.6em;margin-top:.3em;opacity:0;animation:rise .6s .7s ${EASE} forwards}
        .qt .att .bar{width:2em;height:2px;background:var(--accent)}
        .qt .att .nm{font-family:${BODY};font-weight:700;font-size:1.25em;color:var(--text)}
        .qt .att .ro{font-family:${BODY};font-weight:500;font-size:1.1em;color:var(--sub)}`,
      body: `<div class="qt"><div class="mark">&ldquo;</div><blockquote>${esc(d.quote)}</blockquote>
        ${(d.name || d.role) ? `<div class="att"><span class="bar"></span>${d.name ? `<span class="nm">${esc(d.name)}</span>` : ''}${d.role ? `<span class="ro">${esc(d.role)}</span>` : ''}</div>` : ''}</div>`,
    }
  },

  // Process — a numbered sequence (numbering is MEANINGFUL) joined by a drawing line.
  steps(d, c) {
    const items = arr(d.steps).slice(0, 4)
    const node = (s, i) => `<li style="--i:${i}">
      <span class="num">${String(i + 1).padStart(2, '0')}</span>
      <span class="bd"><span class="ti">${esc(s.title ?? s)}</span>${s && s.sub ? `<span class="su">${esc(s.sub)}</span>` : ''}</span></li>`
    return {
      fonts: gf('Archivo', 'wght@500;600;700') + monoLink,
      css: `
        .sp{position:fixed;inset:0;display:flex;flex-direction:column;justify-content:center;gap:.7em;padding:0 11%}
        .sp h1{margin:0 0 .2em;font-family:'Archivo',${BODY};font-weight:700;font-size:2.6em;letter-spacing:-.02em;color:var(--text);opacity:0;animation:rise .55s .05s ${EASE} forwards}
        .sp ol{list-style:none;margin:0;padding:0;position:relative}
        .sp ol:before{content:"";position:absolute;left:calc(1em - 1px);top:1em;bottom:1em;width:2px;background:var(--accent);opacity:.35;transform-origin:top;animation:drawY .8s .3s ${EASE} both}
        .sp li{position:relative;display:flex;align-items:flex-start;gap:.9em;padding:.5em 0;opacity:0;animation:rise .55s ${EASE} forwards;animation-delay:calc(.35s + var(--i)*.16s)}
        .sp .num{flex:none;width:2em;height:2em;border-radius:99px;background:var(--bg);border:2px solid var(--accent);color:var(--accent);font-family:${MONO};font-weight:700;font-size:1em;display:grid;place-items:center;z-index:1}
        .sp .bd{display:flex;flex-direction:column;gap:.1em;padding-top:.15em}
        .sp .ti{font-family:'Archivo',${BODY};font-weight:600;font-size:1.7em;color:var(--text)}
        .sp .su{font-family:${BODY};font-weight:500;font-size:1.1em;color:var(--sub)}`,
      body: `<div class="sp">${d.heading ? `<h1>${esc(d.heading)}</h1>` : ''}<ol>${items.map(node).join('')}</ol></div>`,
    }
  },

  // 2–4 metric tiles in a grid; numbers count up.
  kpiGrid(d, c) {
    const items = arr(d.items).slice(0, 4)
    const cols = items.length >= 4 ? 2 : items.length === 3 ? 3 : items.length
    const tile = (it, i) => `<div class="tile" style="animation-delay:${(0.25 + i * 0.1).toFixed(2)}s"><div class="v">${esc(it.value)}</div><div class="l">${esc(it.label ?? '')}</div></div>`
    return {
      fonts: gf('Chivo', 'wght@600;700;800') + monoLink,
      css: `
        .kp{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1em;padding:0 8%}
        .kp h1{margin:0;font-family:'Chivo',${BODY};font-weight:700;font-size:2.4em;letter-spacing:-.02em;color:var(--text);opacity:0;animation:rise .55s .05s ${EASE} forwards}
        .kp .grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:.8em;width:100%;max-width:92%}
        .kp .tile{background:var(--bg2);border:1px solid var(--hair);border-radius:.55em;padding:1.1em 1em;text-align:center;opacity:0;animation:pop .55s ${EASE} forwards}
        .kp .v{font-family:'Chivo',${MONO};font-weight:800;font-size:3.2em;line-height:1;letter-spacing:-.02em;color:var(--accent)}
        .kp .l{margin-top:.35em;font-family:${BODY};font-weight:500;font-size:1.1em;color:var(--sub)}`,
      body: `<div class="kp">${d.heading ? `<h1>${esc(d.heading)}</h1>` : ''}<div class="grid">${items.map(tile).join('')}</div></div>`,
    }
  },

  // One bold statement — condensed display, per-line mask reveal + accent word.
  statement(d, c) {
    let text = esc(d.text)
    if (d.accentWord) { const w = esc(d.accentWord); text = text.replace(w, `<em>${w}</em>`) }
    const lines = text.split(/\n+/).map((ln, i) => `<span class="ln" style="animation-delay:${(0.15 + i * 0.14).toFixed(2)}s">${ln}</span>`).join('')
    return {
      fonts: gf('Anton') + bodyLink,
      css: `
        .stm{position:fixed;inset:0;display:flex;flex-direction:column;justify-content:center;gap:.5em;padding:0 9%}
        .stm .eb{font-family:${MONO};font-weight:500;font-size:1.05em;letter-spacing:.24em;text-transform:uppercase;color:var(--accent);opacity:0;animation:riseS .5s .05s ${EASE} forwards}
        .stm .hd{display:flex;flex-direction:column;line-height:.98}
        .stm .ln{display:block;font-family:'Anton',${BODY};font-weight:400;font-size:6.4em;letter-spacing:.005em;text-transform:uppercase;color:var(--text);clip-path:inset(0 0 105% 0);animation:clipUp .6s ${EASE} both}
        .stm .ln em{font-style:normal;color:var(--accent)}
        .stm .swipe{width:0;height:.12em;background:var(--accent);border-radius:99px;animation:swipe .6s .55s ${EASE} both}
        @keyframes swipe{to{width:3.4em}}`,
      body: `<div class="stm">${d.eyebrow ? `<div class="eb">${esc(d.eyebrow)}</div>` : ''}<div class="hd">${lines}</div><div class="swipe"></div></div>`,
    }
  },

  // Outro call to action — headline + a pill "button" + URL.
  cta(d, c) {
    return {
      fonts: gf('Outfit', 'wght@500;600;700;800') + monoLink,
      css: `
        .cta{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6em;text-align:center;padding:0 9%}
        .cta h1{margin:0;font-family:'Outfit',${BODY};font-weight:800;font-size:4.4em;line-height:1;letter-spacing:-.03em;color:var(--text);opacity:0;animation:rise .6s .1s ${EASE} forwards}
        .cta p{margin:0;font-family:${BODY};font-weight:500;font-size:1.5em;color:var(--sub);opacity:0;animation:rise .6s .28s ${EASE} forwards}
        .cta .btn{margin-top:.4em;display:inline-flex;align-items:center;gap:.5em;font-family:'Outfit',${BODY};font-weight:700;font-size:1.5em;color:var(--on-accent);background:var(--accent);padding:.55em 1.2em;border-radius:99px;opacity:0;animation:pop .5s .5s ${EASE} forwards,glow 2.4s 1s ease-in-out infinite}
        .cta .btn .ar{display:inline-block;animation:nudge 1.6s 1s ease-in-out infinite}
        .cta .url{font-family:${MONO};font-weight:500;font-size:1.2em;color:var(--sub);opacity:0;animation:fade .6s .7s forwards}`,
      body: `<div class="cta">
        <h1>${esc(d.headline)}</h1>
        ${d.sub ? `<p>${esc(d.sub)}</p>` : ''}
        ${d.action ? `<div class="btn">${esc(d.action)}<span class="ar">&rarr;</span></div>` : ''}
        ${d.url ? `<div class="url">${esc(d.url)}</div>` : ''}
      </div>`,
    }
  },
}

export const CARD_TEMPLATES = Object.keys(T)

// Resolve a hairline color from the theme text (translucent), for tile borders etc.
function hair(text) { return 'color-mix(in srgb, ' + (text || '#fff') + ' 14%, transparent)' }

// Pick a legible foreground (near-black or white) for text sitting ON the accent fill
// (e.g. the CTA pill). Parses #rgb / #rrggbb; anything else → white (accents skew saturated/dark).
function onAccent(accent) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(accent || '').trim())
  if (!m) return '#ffffff'
  let h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  // Perceived luminance (sRGB-weighted). Bright accent → dark text; dark accent → white text.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#0b0f17' : '#ffffff'
}

// Build the full HTML document for a {kind:"card"} scene. `t` is the resolved theme
// ({bg, bg2, accent, text, sub, font}); dims = {W,H}. Unknown template → stat fallback.
export function cardHtml(scene, t, dims) {
  const name = String(scene.template || '').trim()
  const tpl = T[name] || T.stat
  const data = scene.data && typeof scene.data === 'object' ? scene.data : scene
  const solid = Array.isArray(t.bg) ? t.bg[0] : (typeof t.bg === 'string' && !/gradient\(/.test(t.bg) ? t.bg : '#0E1726')
  const bg2 = t.bg2 || `color-mix(in srgb, ${solid} 88%, ${t.text || '#fff'} 12%)`
  const bgCss = Array.isArray(t.bg) ? `linear-gradient(150deg, ${t.bg[0]}, ${t.bg[1] || t.bg[0]})` : (typeof t.bg === 'string' && /gradient\(/.test(t.bg) ? t.bg : solid)
  const vars = `--bg:${solid};--bg2:${bg2};--accent:${t.accent || '#f59e0b'};--text:${t.text || '#ffffff'};--sub:${t.sub || 'color-mix(in srgb, ' + (t.text || '#fff') + ' 62%, transparent)'};--hair:${hair(t.text)};--acc-a:color-mix(in srgb, ${t.accent || '#f59e0b'} 45%, transparent);--on-accent:${onAccent(t.accent || '#f59e0b')}`
  const r = tpl(data, t)
  const base = Math.round((dims?.H || 1080) / 46) // 1em scales with height so cards fit any aspect
  return `<meta charset="utf-8">${r.fonts}${bodyLink}<style>
    *{box-sizing:border-box;margin:0}
    html,body{width:100%;height:100%;overflow:hidden}
    :root{${vars}}
    body{background:${bgCss};color:var(--text);font-family:${BODY};font-size:${base}px}
    ${KF}
    ${r.css}
  </style>${r.body}`
}
