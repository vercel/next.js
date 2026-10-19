// Primitives for Next.js docs diagrams.
//
// Every value here was measured from diagrams already published in the docs
// (see style-tokens.md). Coordinates are CSS px on a canvas that is normally
// 1600 wide; render.sh screenshots at 2x. Keep colors and sizes as tokens on
// the theme object; drawing functions take a theme `t` and return SVG strings.

export const themes = {
  light: {
    bg: '#FBFBFB',
    grid: '#F7F7F7',
    // Panels (file trees, URL pills, code panels, browser windows)
    panelTop: '#FFFFFF',
    panelBottom: '#F9F9F9',
    panelStroke: '#D9D9D9',
    panelMuted: '#F1F1F1',
    divider: '#E8E8E8',
    shadow: 'rgba(0,0,0,0.08)',
    titleBar: '#F7F7F7',
    titleBarDivider: '#E3E3E3',
    // Text
    text: '#2E2E2E',
    textMuted: '#8F8F8F',
    textSubtle: '#616161',
    icon: '#9A9A9A',
    iconMuted: '#CECECE',
    arrow: '#A8A8A8',
    // Skeleton UI
    skel: '#C9C9C9',
    // Accents: stroke / light fill / text. Inside a tinted region, skeleton
    // bars use `skelOn` and image placeholders `thumbOn`.
    blue: {
      stroke: '#0070F3',
      fill: '#D5E6FA',
      text: '#0067D6',
      badgeFill: '#CDE7FF',
      dot: '#197DF3',
      skelOn: '#A8B9CD',
      thumbOn: '#C1D2E5',
    },
    purple: {
      stroke: '#8E4EC6',
      fill: '#EAE0F2',
      text: '#793AAF',
      badgeFill: '#EDDBF9',
      skelOn: '#BFB6C8',
      thumbOn: '#D6CDDF',
    },
    red: {
      stroke: '#E5484D',
      fill: '#F7DFE0',
      text: '#CA2A30',
      badgeFill: '#F5DDDE',
    },
    green: {
      stroke: '#46A758',
      fill: '#DCEBDF',
      text: '#46A758',
      badgeFill: '#DCEBDF',
    },
    gray: {
      stroke: '#8F8F8F',
      fill: '#DEDEDE',
      text: '#666666',
      badgeFill: '#DEDEDE',
    },
    // A static / prerendered region in a bar or grid cell: lighter than `gray`
    static: {
      stroke: '#C9C9C9',
      fill: '#F1F1F1',
      text: '#666666',
      badgeFill: '#F1F1F1',
    },
    // Code (GitHub Light, as used in the component hierarchy panels)
    code: {
      tag: '#005CC5',
      attr: '#6F42C1',
      keyword: '#D73A49',
      ident: '#E36209',
      punct: '#909295',
      plain: '#2E2E2E',
      react: '#61DAFB',
    },
    trafficLights: ['#FF6059', '#FFBD2E', '#28CA42'],
  },
  dark: {
    bg: '#0D0D0D',
    grid: '#161616',
    panelTop: '#313131',
    panelBottom: '#282828',
    panelStroke: '#484848',
    panelMuted: '#1F1F1F',
    divider: '#434343',
    shadow: 'rgba(0,0,0,0.5)',
    titleBar: '#232323',
    titleBarDivider: '#3A3A3A',
    text: '#D4D4D4',
    textMuted: '#A1A1A1',
    textSubtle: '#8F8F8F',
    icon: '#888888',
    iconMuted: '#555555',
    arrow: '#878787',
    skel: '#4A4A4A',
    blue: {
      stroke: '#0A72EF',
      fill: '#10233D',
      text: '#52A8FF',
      badgeFill: '#0D2A4D',
      dot: '#0761C9',
      skelOn: '#2F4A6E',
      thumbOn: '#1E3657',
    },
    purple: {
      stroke: '#9A5CD0',
      fill: '#2A1F38',
      text: '#C4A1E6',
      badgeFill: '#2F2240',
      skelOn: '#4A3D5C',
      thumbOn: '#3A2E49',
    },
    red: {
      stroke: '#E5484D',
      fill: '#3A1D1F',
      text: '#F08A8E',
      badgeFill: '#3A1D1F',
    },
    green: {
      stroke: '#46A758',
      fill: '#1B2E1F',
      text: '#6FCB80',
      badgeFill: '#1B2E1F',
    },
    gray: {
      stroke: '#6F6F6F',
      fill: '#2A2A2A',
      text: '#B0B0B0',
      badgeFill: '#2A2A2A',
    },
    static: {
      stroke: '#4A4A4A',
      fill: '#1F1F1F',
      text: '#B0B0B0',
      badgeFill: '#1F1F1F',
    },
    code: {
      tag: '#79B8FF',
      attr: '#B392F0',
      keyword: '#F97583',
      ident: '#FFAB70',
      punct: '#8B949E',
      plain: '#D4D4D4',
      react: '#61DAFB',
    },
    trafficLights: ['#FF6059', '#FFBD2E', '#28CA42'],
  },
}

export const sans = `font-family="Inter, system-ui, sans-serif"`
export const mono = `font-family="'Geist Mono', ui-monospace, monospace"`

// Snap a 1px stroke to the half pixel so it renders crisp at 1x and 2x.
const half = (v) => Math.round(v) + 0.5

let idCounter = 0
const uid = (prefix) => `${prefix}${++idCounter}`

// ---------------------------------------------------------------------------
// Canvas

export function canvas(t, W, H, body) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs>`,
    `<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${t.grid}" stroke-width="1"/></pattern>`,
    `<filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="8"/></filter>`,
    `<linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.panelTop}"/><stop offset="1" stop-color="${t.panelBottom}"/></linearGradient>`,
    `</defs>`,
    `<rect width="${W}" height="${H}" fill="${t.bg}"/><rect width="${W}" height="${H}" fill="url(#grid)"/>`,
    body,
    `</svg>`,
  ].join('\n')
}

// Wrap diagram HTML so headless Chrome waits for Inter before screenshotting.
export function html(t, svg) {
  return `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=block" rel="stylesheet"><style>html,body{margin:0;background:${t.bg}}svg{display:block}</style></head><body>${svg}</body></html>`
}

// ---------------------------------------------------------------------------
// Text

export function label(
  t,
  x,
  y,
  str,
  {
    size = 20,
    weight = 400,
    color = t.text,
    anchor = 'start',
    font = sans,
  } = {}
) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="central" font-size="${size}" font-weight="${weight}" fill="${color}" ${font}>${esc(str)}</text>`
}

export function code(t, x, y, str, opts = {}) {
  return label(t, x, y, str, { font: mono, ...opts })
}

// Approximate rendered width of a string. There are no font metrics at
// generation time, so this is the heuristic the primitives use; use it in
// modules too when a block's width depends on a label.
export function textWidth(str, size, { mono: isMono = false } = {}) {
  return String(str).length * size * (isMono ? 0.58 : 0.52)
}

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ---------------------------------------------------------------------------
// Panels

// A white-to-off-white card with a 1px border and a soft shadow. Base for the
// file tree, URL pill, code panel and browser window.
export function panel(
  t,
  x,
  y,
  w,
  h,
  {
    radius = 10,
    shadow = true,
    fill = 'url(#panel)',
    stroke = t.panelStroke,
  } = {}
) {
  const s = []
  if (shadow)
    s.push(
      `<rect x="${x}" y="${y + 6}" width="${w}" height="${h}" rx="${radius}" fill="${t.shadow}" filter="url(#shadow)"/>`
    )
  s.push(
    `<rect x="${half(x)}" y="${half(y)}" width="${w - 1}" height="${h - 1}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`
  )
  return s.join('\n')
}

// ---------------------------------------------------------------------------
// Icons (18px glyphs, drawn at x,y = top-left, stroke 1.5)

export const icons = {
  folder: (x, y, c) =>
    `<path d="M${x + 1.5} ${y + 5} a1.5 1.5 0 0 1 1.5 -1.5 h4.2 l2 2 h6.3 a1.5 1.5 0 0 1 1.5 1.5 v7.5 a1.5 1.5 0 0 1 -1.5 1.5 h-12.5 a1.5 1.5 0 0 1 -1.5 -1.5 z" fill="none" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>`,
  file: (x, y, c) =>
    `<path d="M${x + 4} ${y + 1.5} h6 l4 4 v9.5 a1.5 1.5 0 0 1 -1.5 1.5 h-8.5 a1.5 1.5 0 0 1 -1.5 -1.5 v-12 a1.5 1.5 0 0 1 1.5 -1.5 z M${x + 10} ${y + 1.5} v4 h4" fill="none" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>`,
  layout: (x, y, c) =>
    `<rect x="${x + 2}" y="${y + 2.5}" width="14" height="13" rx="1.5" fill="none" stroke="${c}" stroke-width="1.5"/><path d="M${x + 2} ${y + 7} H${x + 16} M${x + 7} ${y + 7} V${y + 15.5}" stroke="${c}" stroke-width="1.5"/>`,
  globe: (x, y, c) =>
    `<circle cx="${x + 9}" cy="${y + 9}" r="7" fill="none" stroke="${c}" stroke-width="1.5"/><path d="M${x + 2} ${y + 9} H${x + 16} M${x + 9} ${y + 2} c-3 2.5 -3 11.5 0 14 M${x + 9} ${y + 2} c3 2.5 3 11.5 0 14" fill="none" stroke="${c}" stroke-width="1.5"/>`,
  lock: (x, y, c) =>
    `<rect x="${x + 4}" y="${y + 8}" width="10" height="8" rx="1.5" fill="${c}"/><path d="M${x + 6} ${y + 8} V${y + 6} a3 3 0 0 1 6 0 V${y + 8}" fill="none" stroke="${c}" stroke-width="1.5"/>`,
  route: (x, y, c) =>
    `<path d="M${x + 11} ${y + 3} c-3 0 -3 3 -3 5 v6 M${x + 5} ${y + 9} h6" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>`,
  react: (x, y, c) => {
    const cx = x + 9,
      cy = y + 9
    return (
      [0, 60, 120]
        .map(
          (a) =>
            `<ellipse cx="${cx}" cy="${cy}" rx="8" ry="3" fill="none" stroke="${c}" stroke-width="1.2" transform="rotate(${a} ${cx} ${cy})"/>`
        )
        .join('') + `<circle cx="${cx}" cy="${cy}" r="1.6" fill="${c}"/>`
    )
  },
}

// ---------------------------------------------------------------------------
// File tree panel: the "app / page.js → URL" family.
//
// rows: [{ label, icon, depth = 0, bold, dot, muted }]
// Returns { svg, rowY(i) } so arrows can be aligned to rows.

export const TREE_ROW = 80

export function treePanel(t, x, y, w, rows, { indent = 40, pad = 32 } = {}) {
  const h = rows.length * TREE_ROW
  const s = [panel(t, x, y, w, h)]
  rows.forEach((r, i) => {
    const ry = y + i * TREE_ROW
    if (r.muted) {
      const rx = half(x),
        ryy = half(ry)
      const isLast = i === rows.length - 1
      s.push(
        `<path d="M${rx} ${ryy} H${rx + w - 1} V${ryy + TREE_ROW - 1 - (isLast ? 10 : 0)} ${isLast ? `a10 10 0 0 1 -10 10 H${rx + 10} a10 10 0 0 1 -10 -10` : `H${rx}`} Z" fill="${t.panelMuted}"/>`
      )
    }
    if (i > 0)
      s.push(
        `<line x1="${x + 1}" x2="${x + w - 1}" y1="${half(ry)}" y2="${half(ry)}" stroke="${t.divider}"/>`
      )
    const ix = x + pad + (r.depth || 0) * indent
    const color = r.muted ? t.iconMuted : t.icon
    if (r.icon) s.push(icons[r.icon](ix, ry + TREE_ROW / 2 - 9, color))
    s.push(
      label(t, ix + 32, ry + TREE_ROW / 2, r.label, {
        weight: r.bold ? 600 : 400,
        color: r.muted ? t.textMuted : t.text,
      })
    )
    if (r.dot) s.push(dot(t, x + w - pad - 10, ry + TREE_ROW / 2))
  })
  return { svg: s.join('\n'), h, rowY: (i) => y + i * TREE_ROW + TREE_ROW / 2 }
}

// The blue "this is the file we are talking about" marker, with a soft glow.
export function dot(t, cx, cy, color = t.blue) {
  return `<circle cx="${cx}" cy="${cy}" r="16" fill="${color.fill}" opacity="0.8"/><circle cx="${cx}" cy="${cy}" r="10" fill="${color.dot}"/>`
}

// URL pill: globe + path. `muted` renders the "not routable" variant.
export function urlPill(
  t,
  x,
  y,
  w,
  path,
  { muted = false, h = TREE_ROW } = {}
) {
  const s = [
    panel(t, x, y, w, h, { fill: muted ? t.panelMuted : 'url(#panel)' }),
  ]
  s.push(icons.globe(x + 32, y + h / 2 - 9, muted ? t.iconMuted : t.icon))
  s.push(
    label(t, x + 64, y + h / 2, path, { color: muted ? t.textMuted : t.text })
  )
  return s.join('\n')
}

// Stack several URL pills into one panel (dividers between them).
export function urlStack(t, x, y, w, paths) {
  const h = paths.length * TREE_ROW
  const s = [panel(t, x, y, w, h)]
  paths.forEach((p, i) => {
    const ry = y + i * TREE_ROW
    if (p.muted)
      s.push(
        `<rect x="${x + 1}" y="${ry + 1}" width="${w - 2}" height="${TREE_ROW - 2}" rx="${i === 0 || i === paths.length - 1 ? 10 : 0}" fill="${t.panelMuted}"/>`
      )
    if (i > 0)
      s.push(
        `<line x1="${x + 1}" x2="${x + w - 1}" y1="${half(ry)}" y2="${half(ry)}" stroke="${t.divider}"/>`
      )
    s.push(
      icons.globe(x + 32, ry + TREE_ROW / 2 - 9, p.muted ? t.iconMuted : t.icon)
    )
    s.push(
      label(t, x + 64, ry + TREE_ROW / 2, p.path, {
        color: p.muted ? t.textMuted : t.text,
      })
    )
  })
  return s.join('\n')
}

// ---------------------------------------------------------------------------
// Arrows

// Straight horizontal arrow with an open chevron head.
export function arrow(
  t,
  x1,
  x2,
  y,
  { color = t.arrow, width = 2, k = 1 } = {}
) {
  const dir = x2 > x1 ? 1 : -1
  const hx = x2 - dir * 10 * k
  return (
    `<line x1="${x1}" x2="${x2 - dir}" y1="${y}" y2="${y}" stroke="${color}" stroke-width="${width * k}" stroke-linecap="round"/>` +
    `<path d="M${hx} ${y - 7 * k} L${x2} ${y} L${hx} ${y + 7 * k}" fill="none" stroke="${color}" stroke-width="${width * k}" stroke-linecap="round" stroke-linejoin="round"/>`
  )
}

// Bracket arrow used beside file trees: leaves row `fromY` to the left, drops
// to row `toY`, and points back in. `x` is the panel's left edge.
export function bracketArrow(
  t,
  x,
  fromY,
  toY,
  { reach = 60, color = t.arrow } = {}
) {
  const bx = x - reach
  return (
    `<path d="M${x} ${fromY} H${bx + 10} a10 10 0 0 0 -10 10 V${toY - 10} a10 10 0 0 0 10 10 H${x - 2}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M${x - 10} ${toY - 7} L${x} ${toY} L${x - 10} ${toY + 7}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  )
}

// Caption bracket under a group of things, with centered text beneath it.
export function bracketCaption(t, x1, x2, y, text) {
  return (
    `<path d="M${x1} ${y - 12} v4 a8 8 0 0 0 8 8 H${x2 - 8} a8 8 0 0 0 8 -8 v-4" fill="none" stroke="${t.arrow}" stroke-width="2" stroke-linecap="round"/>` +
    label(t, (x1 + x2) / 2, y + 40, text, {
      size: 20,
      color: t.textMuted,
      anchor: 'middle',
    })
  )
}

// ---------------------------------------------------------------------------
// Browser window. Proportions are the docs' 527×476 window at 1600 wide; pass
// a smaller `w` and everything scales with it.

export function browserWindow(t, x, y, w, h, url, body = '') {
  const k = w / 527 // scale factor relative to the reference window
  const bar = Math.round(70 * k)
  const r = Math.round(12 * k)
  const s = [panel(t, x, y, w, h, { radius: r })]
  s.push(
    `<path d="M${half(x)} ${half(y) + bar} V${half(y) + r} a${r} ${r} 0 0 1 ${r} -${r} H${half(x) + w - 1 - r} a${r} ${r} 0 0 1 ${r} ${r} V${half(y) + bar} Z" fill="${t.titleBar}"/>`
  )
  s.push(
    `<line x1="${x + 1}" x2="${x + w - 1}" y1="${half(y + bar)}" y2="${half(y + bar)}" stroke="${t.titleBarDivider}"/>`
  )
  t.trafficLights.forEach((c, i) =>
    s.push(
      `<circle cx="${x + 37 * k + i * 28 * k}" cy="${y + bar / 2}" r="${9 * k}" fill="${c}"/>`
    )
  )
  const pw = 320 * k,
    ph = 44 * k,
    px = x + 155 * k,
    py = y + (bar - ph) / 2
  s.push(
    `<rect x="${half(px)}" y="${half(py)}" width="${pw - 1}" height="${ph - 1}" rx="${8 * k}" fill="${t.panelTop}" stroke="${t.panelStroke}"/>`
  )
  s.push(
    `<g transform="translate(${px + 12 * k} ${py + ph / 2 - 9 * k}) scale(${k})">${icons.lock(0, 0, t.icon)}</g>`
  )
  s.push(
    label(t, px + 36 * k, py + ph / 2, url, {
      size: 20 * k,
      color: t.textSubtle,
    })
  )
  s.push(body)
  return { svg: s.join('\n'), x, y, w, h, contentY: y + bar, k }
}

// Skeleton pieces
export const skel = {
  bar: (t, x, y, w, h = 24, color = t.skel) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(6, h / 2)}" fill="${color}"/>`,
  avatar: (t, cx, cy, r = 28, color = t.skel) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`,
  square: (t, x, y, size = 24, color = t.skel) =>
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size / 5}" fill="${color}"/>`,
  // Image placeholder: tile with a mountain and a sun.
  thumb: (t, x, y, w, h, color = t.skel, detail = t.textMuted) => {
    const s = Math.min(w, h)
    return (
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${s / 8}" fill="${color}"/>` +
      `<circle cx="${x + w * 0.32}" cy="${y + h * 0.32}" r="${s * 0.09}" fill="${detail}" opacity="0.6"/>` +
      `<path d="M${x + w * 0.12} ${y + h * 0.82} L${x + w * 0.42} ${y + h * 0.5} L${x + w * 0.6} ${y + h * 0.66} L${x + w * 0.72} ${y + h * 0.56} L${x + w * 0.9} ${y + h * 0.82} Z" fill="${detail}" opacity="0.6"/>`
    )
  },
}

// The page inside a browser window, laid out the way the docs draw it: a
// header row (avatar + title bar), a sidebar of short bars, and a content
// column that shares its top and bottom edges with the sidebar. Everything is
// scaled by the window's `k`. Returns the content rect; fill it per moment
// with `postCard`, `commentRows`, `hole` and `card`.
export function pageLayout(t, win, { sidebar = true } = {}) {
  const { x, y, w, h, contentY, k } = win
  const pad = 28 * k
  const s = []
  // header: avatar and a title bar, vertically centered on each other
  const r = 14 * k
  const hy = contentY + pad + r
  s.push(skel.avatar(t, x + pad + r, hy, r))
  s.push(
    skel.bar(
      t,
      x + pad + r * 2 + 16 * k,
      hy - 8 * k,
      w - pad * 2 - r * 2 - 16 * k,
      16 * k
    )
  )
  // sidebar and content column
  const top = hy + r + 24 * k
  const bottom = y + h - pad
  const sbW = sidebar ? 110 * k : 0
  if (sidebar) {
    // a stack of short bars from the top, like a nav list
    const widths = [1, 0.75, 0.9, 0.6]
    const bh = 14 * k
    widths.forEach((f, i) =>
      s.push(skel.bar(t, x + pad, top + i * 40 * k, sbW * f, bh))
    )
  }
  const cx = x + pad + sbW + (sidebar ? 24 * k : 0)
  const content = { x: cx, y: top, w: x + w - pad - cx, h: bottom - top }
  // the usual split of the content column: post on top, comments below
  const gap = 12 * k
  const postH = Math.round((content.h - gap) * 0.56)
  const regions = {
    post: { x: cx, y: top, w: content.w, h: postH },
    comments: {
      x: cx,
      y: top + postH + gap,
      w: content.w,
      h: content.h - postH - gap,
    },
  }
  return { svg: s.join('\n'), content, regions, k }
}

// A post card: outlined card with a title bar and body lines. `color` 'skel'
// draws it as plain rendered UI; an accent name draws it as an accent card
// with the skeleton tinted to match.
export function postCard(t, x, y, w, h, k = 1, color = 'skel') {
  const accent = color !== 'skel' ? t[color] : null
  const c = accent ? accent.skelOn : t.skel
  const pad = 16 * k
  const frame = accent
    ? card(t, x, y, w, h, { color, radius: 8 * k, strokeWidth: 1.5 * k })
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${8 * k}" fill="none" stroke="${t.panelStroke}" stroke-width="${1.5 * k}"/>`
  // title bar plus at most three body lines; the card's height is the caller's
  const lines = Math.max(
    1,
    Math.min(3, Math.floor((h - pad * 2 - 14 * k) / (18 * k)))
  )
  let body = skel.bar(
    t,
    x + pad,
    y + pad,
    Math.min(120 * k, w * 0.45),
    14 * k,
    c
  )
  for (let i = 0; i < lines; i++) {
    const ly = y + pad + 14 * k + 10 * k + i * 18 * k
    if (ly + 8 * k > y + h - pad) break
    body += skel.bar(
      t,
      x + pad,
      ly,
      (w - pad * 2) * (i === lines - 1 ? 0.6 : 1),
      8 * k,
      c
    )
  }
  return frame + body
}

// Comment rows: small avatar + one line each, spread evenly over the height.
export function commentRows(
  t,
  x,
  y,
  w,
  h,
  k = 1,
  color = 'skel',
  rows = 3,
  { frame = color !== 'skel' } = {}
) {
  const c = color !== 'skel' ? t[color].skelOn : t.skel
  let out = ''
  if (frame) {
    out += card(t, x, y, w, h, { color, radius: 8 * k, strokeWidth: 1.5 * k })
    const pad = 12 * k
    x += pad
    y += pad
    w -= pad * 2
    h -= pad * 2
  }
  const r = 7 * k
  const step = rows > 1 ? Math.min(34 * k, (h - r * 2) / (rows - 1)) : 0
  const widths = [0.7, 0.45, 0.6]
  for (let i = 0; i < rows; i++) {
    const cy = y + r + i * step
    out += skel.avatar(t, x + r, cy, r, c)
    out += skel.bar(
      t,
      x + r * 2 + 10 * k,
      cy - 4 * k,
      (w - r * 2 - 10 * k) * widths[i % widths.length],
      8 * k,
      c
    )
  }
  return out
}

// A region that has not rendered yet. Blue dashed by default; `style: 'gray'`
// gives the Suspense-fallback look. Optional centered label.
export function hole(
  t,
  x,
  y,
  w,
  h,
  {
    style = 'blue',
    label: text,
    radius = 10,
    strokeWidth = 2,
    dash = '8 5',
    labelSize = Math.min(18, h / 3),
  } = {}
) {
  const c = style === 'gray' ? null : t[style]
  const rect = c
    ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="${strokeWidth}" stroke-dasharray="${dash}"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="none" stroke="${t.panelStroke}" stroke-width="${strokeWidth}" stroke-dasharray="${dash}"/>`
  return (
    rect +
    (text
      ? label(t, x + w / 2, y + h / 2, text, {
          size: labelSize,
          weight: 500,
          color: c ? c.text : t.textMuted,
          anchor: 'middle',
        })
      : '')
  )
}

// A solid accent card (content that has rendered, a highlighted row, a route box).
export function card(
  t,
  x,
  y,
  w,
  h,
  {
    color = 'blue',
    radius = 10,
    dashed = false,
    strokeWidth = 2,
    dash = '8 5',
    label: text,
    labelSize = Math.min(18, h / 3),
  } = {}
) {
  const c = t[color]
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="${strokeWidth}"${dashed ? ` stroke-dasharray="${dash}"` : ''}/>` +
    (text
      ? label(t, x + w / 2, y + h / 2, text, {
          size: labelSize,
          weight: 500,
          color: c.text,
          anchor: 'middle',
        })
      : '')
  )
}

// ---------------------------------------------------------------------------
// Badges and legends

// Letter badge (A, B, S, D) anchored at its top-left corner.
export function badge(t, x, y, letter, color = 'blue', size = 32) {
  const c = t[color]
  return (
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size / 4}" fill="${c.badgeFill}" stroke="${c.stroke}" stroke-width="2"/>` +
    label(t, x + size / 2, y + size / 2, letter, {
      size: size * 0.6,
      weight: 500,
      color: c.text,
      anchor: 'middle',
    })
  )
}

// Mono status pill: "Routable", "HARD NAV", "Zone A".
export function statusBadge(
  t,
  x,
  y,
  text,
  color = 'gray',
  { size = 18, padX = 14, h = 34 } = {}
) {
  const c = t[color]
  const w = Math.round(textWidth(text, size, { mono: true }) + padX * 2)
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${c.badgeFill}" stroke="${c.stroke}" stroke-width="1.5"/>` +
    code(t, x + w / 2, y + h / 2, text, {
      size,
      color: c.text,
      anchor: 'middle',
    })
  )
}

// Legend row: badge + description.
export function legendRow(t, x, y, letter, color, text) {
  return (
    badge(t, x, y, letter, color, 36) +
    label(t, x + 52, y + 18, text, { size: 20, color: t.textMuted })
  )
}

// Callout: label with a leader line ending at (tx, ty).
export function callout(
  t,
  x,
  y,
  text,
  tx,
  ty,
  { color = t.arrow, anchor = 'end' } = {}
) {
  const lx = anchor === 'end' ? x + 16 : x - 16
  return (
    label(t, x, y, text, {
      size: 22,
      weight: 600,
      color: t.textSubtle,
      anchor,
    }) +
    `<line x1="${lx}" y1="${y}" x2="${tx}" y2="${ty}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`
  )
}

// ---------------------------------------------------------------------------
// Code panel with a title bar (React icon + file name) and highlighted lines.
// lines: array of arrays of [text, tokenName]; tokenName indexes t.code.

export function codePanel(
  t,
  x,
  y,
  w,
  title,
  lines,
  { lineHeight = 36, size = 20, pad = 28 } = {}
) {
  const bar = 54
  const h = bar + pad * 2 + lines.length * lineHeight - (lineHeight - size)
  const s = [panel(t, x, y, w, h)]
  s.push(
    `<path d="M${half(x)} ${half(y) + bar} V${half(y) + 10} a10 10 0 0 1 10 -10 H${half(x) + w - 11} a10 10 0 0 1 10 10 V${half(y) + bar} Z" fill="${t.titleBar}"/>`
  )
  s.push(
    `<line x1="${x + 1}" x2="${x + w - 1}" y1="${half(y + bar)}" y2="${half(y + bar)}" stroke="${t.titleBarDivider}"/>`
  )
  s.push(icons.react(x + 24, y + bar / 2 - 9, t.code.react))
  s.push(
    label(t, x + 54, y + bar / 2, title, { size: 18, color: t.textSubtle })
  )
  lines.forEach((tokens, i) => {
    const ly = y + bar + pad + i * lineHeight + size / 2
    let cx = x + pad
    tokens.forEach(([text, kind = 'plain']) => {
      s.push(code(t, cx, ly, text, { size, color: t.code[kind] }))
      cx += textWidth(text, size, { mono: true })
    })
  })
  return { svg: s.join('\n'), h }
}

// Legend row whose key is a fill style rather than a letter: a small card or
// hole drawn the way the thing it explains is drawn.
// kind: { color, dashed } for a card, or { hole: 'blue' | 'gray' } for a hole.
// `k` scales every size for canvases narrower than 1600 (k = width / 1600).
// Its width is 60k + textWidth(text, 20k) when several sit in one row.
export function swatchLegend(t, x, y, kind, text, { k = 1 } = {}) {
  const sw = kind.hole
    ? hole(t, x, y, 44 * k, 24 * k, {
        style: kind.hole,
        radius: 6 * k,
        strokeWidth: 2 * k,
        dash: `${8 * k} ${5 * k}`,
      })
    : card(t, x, y, 44 * k, 24 * k, {
        color: kind.color ?? 'blue',
        dashed: !!kind.dashed,
        radius: 6 * k,
        strokeWidth: 2 * k,
        dash: `${8 * k} ${5 * k}`,
      })
  return (
    sw +
    label(t, x + 60 * k, y + 12 * k, text, { size: 20 * k, color: t.textMuted })
  )
}

// ---------------------------------------------------------------------------
// Grid: column headers across the top (stages, moments, variants), a label
// column on the left (one per row), faint dashed dividers between columns.
// Draw the cells yourself with `card` / `hole` from the returned geometry:
//   const g = grid(t, x, y, { columns, rows }); g.span(row, fromCol, toCol) -> { x, y, w, h }
// To line the columns up with a row of windows above: colW = windowW + gap,
// inset = gap / 2, x = first window's x - labelW - gap - gap / 2, and
// y = window bottom + 16 * k. The column headers then sit under the windows
// and double as their captions. The dividers extend `inset` beyond the first
// and last window on each side; include that when centering the block.
//
// columns: [{ title, subtitle, subtitleMono }]   rows: [{ label, mono = true, muted }]

export function grid(
  t,
  x,
  y,
  {
    columns,
    rows,
    k = 1, // scales every default below and the text (k = width / 1600)
    labelW = 200 * k,
    labelHeader,
    labelHeaderMono = true,
    colW = 260 * k,
    rowH = 56 * k,
    rowGap = 20 * k,
    headerH = (columns.some((c) => c.subtitle) ? 70 : 48) * k,
    gap = 40 * k, // between the label column and the first column
    inset = 10 * k, // cell inset from the column dividers
  }
) {
  const s = []
  const colX = (i) => x + labelW + gap + i * colW
  const rowY = (r) => y + headerH + r * (rowH + rowGap)
  const h = headerH + rows.length * rowH + (rows.length - 1) * rowGap
  const w = labelW + gap + columns.length * colW
  // Header text is centered 12px below `y` so its cap height starts at `y`;
  // the dividers end at the last row, so [y, y + h] is the visual box.
  if (labelHeader)
    s.push(
      (labelHeaderMono ? code : label)(t, x + labelW, y + 12 * k, labelHeader, {
        size: 18 * k,
        color: t.textMuted,
        anchor: 'end',
      })
    )
  columns.forEach((c, i) => {
    const cx = colX(i) + colW / 2
    s.push(
      label(t, cx, y + 12 * k, c.title, {
        size: 20 * k,
        weight: 600,
        color: t.textSubtle,
        anchor: 'middle',
      })
    )
    if (c.subtitle)
      s.push(
        (c.subtitleMono ? code : label)(t, cx, y + 42 * k, c.subtitle, {
          size: 15 * k,
          color: t.textMuted,
          anchor: 'middle',
        })
      )
  })
  for (let i = 0; i <= columns.length; i++) {
    const dx = half(colX(i))
    s.push(
      `<line x1="${dx}" x2="${dx}" y1="${y + headerH - 10 * k}" y2="${y + h}" stroke="${t.divider}" stroke-dasharray="${4 * k} ${4 * k}"/>`
    )
  }
  rows.forEach((r, i) => {
    const cy = rowY(i) + rowH / 2
    s.push(
      (r.mono === false ? label : code)(t, x + labelW, cy, r.label, {
        size: 20 * k,
        color: r.muted ? t.textMuted : t.text,
        anchor: 'end',
      })
    )
  })
  return {
    svg: s.join('\n'),
    w,
    h,
    colX,
    rowY,
    span: (r, from, to = from) => ({
      x: colX(from) + inset,
      y: rowY(r),
      w: (to - from + 1) * colW - inset * 2,
      h: rowH,
    }),
  }
}
