import fs from 'fs'

const themes = {
  light: {
    bg: '#FAFAFA',
    grid: '#EDEDED',
    winFill: '#FFFFFF',
    winHead: '#F7F7F7',
    winStroke: '#D9D9D9',
    shadow: 'rgba(0,0,0,0.07)',
    skel: '#D1D1D1',
    url: '#FFFFFF',
    urlStroke: '#D4D4D4',
    urlText: '#8A8A8A',
    blue: '#0070F3',
    blueFill: '#DCEBFE',
    hi: '#7FB3F7',
    label: '#6F6F6F',
    code: '#4D4D4D',
    barGray: '#EBEBEB',
    barGrayStroke: '#BDBDBD',
    barGrayText: '#666666',
    barBlueText: '#0060D1',
    arrow: '#A8A8A8',
  },
  dark: {
    bg: '#111111',
    grid: '#1F1F1F',
    winFill: '#1A1A1A',
    winHead: '#232323',
    winStroke: '#3A3A3A',
    shadow: 'rgba(0,0,0,0.45)',
    skel: '#4A4A4A',
    url: '#1A1A1A',
    urlStroke: '#454545',
    urlText: '#8F8F8F',
    blue: '#0A72EF',
    blueFill: '#10233D',
    hi: '#3B7FD6',
    label: '#A1A1A1',
    code: '#D4D4D4',
    barGray: '#262626',
    barGrayStroke: '#555555',
    barGrayText: '#A1A1A1',
    barBlueText: '#52A8FF',
    arrow: '#5E5E5E',
  },
}

// Each diagram shares the three-window strip and differs in its bar rows and
// in how the windows mark deferred content:
//   holeLabel         text inside the dashed box (what the box stands for)
//   holeStyle         'blue' (default) or 'gray', to match the bar that means the same thing
//   highlightRendered color the content that has rendered so far blue (post, then comments)
// A row is [code label, segments]; a segment is [kind, endsAtGap] where endsAtGap
// is the index of the gap (0 or 1) the segment stops at, or null for the right edge.
const diagrams = {
  'ensure-static-stage': {
    height: 530,
    holeLabel: 'Renders later',
    rows: [
      [
        "ensureStatic = 'shell'",
        [
          ['static', 0],
          ['later', null],
        ],
      ],
      [
        "ensureStatic = 'prefetch'",
        [
          ['static', 1],
          ['later', null],
        ],
      ],
      ["ensureStatic = 'navigation'", [['static', null]]],
    ],
  },
  'navigation-stage': {
    height: 480,
    holeLabel: 'Suspense fallback',
    holeStyle: 'gray', // match the "Suspense fallback" bar, so blue only means "Renders" here
    highlightRendered: true, // content that renders after the await is blue, cumulatively
    rows: [
      [
        'await prefetch()',
        [
          ['fallback', 0],
          ['renders', null],
        ],
      ],
      [
        'await navigation()',
        [
          ['fallback', 1],
          ['renders', null],
        ],
      ],
    ],
  },
}

const barText = {
  static: 'Static',
  later: 'Can render later',
  fallback: 'Suspense fallback',
  renders: 'Renders',
}

// Canvas width is fixed; height comes from the diagram.
const W = 1200

// Horizontal layout: the code labels plus the three windows are centered as one block.
const CW = 256 // window width
const COL_GAP = 44 // gap between windows
const LABEL_W = 228 // measured width of "ensureStatic = 'navigation'" at 14px Geist Mono
const LABEL_GAP = 28
const BLOCK_W = LABEL_W + LABEL_GAP + CW * 3 + COL_GAP * 2
const X0 = Math.round((W - BLOCK_W) / 2)
const LABEL_X = X0 + LABEL_W
const COLS = [0, 1, 2].map((i) => LABEL_X + LABEL_GAP + i * (CW + COL_GAP))
const END = COLS[2] + CW
const GAPS = [0, 1].map((i) => COLS[i] + CW + COL_GAP / 2) // centers of the two gaps

// Vertical layout
const WY = 48,
  WH = 208 // window top / height
const HEAD = 30 // title bar height
const PAD = 14 // inner padding
const NAV_H = 10 // navbar skeleton height
const CT = WY + HEAD + PAD + NAV_H + PAD // content top
const CB = WY + WH - PAD // content bottom
const CH = CB - CT // content height
const STAGE_Y = WY + WH + 30 // stage label baseline
const BAR_Y0 = 332,
  BAR_H = 34,
  BAR_GAP = 58

const font = `font-family="Inter, system-ui, sans-serif"`
const mono = `font-family="'Geist Mono', ui-monospace, monospace"`

function lock(x, y, c) {
  return (
    `<rect x="${x}" y="${y + 3.5}" width="6" height="4.5" rx="1" fill="${c}"/>` +
    `<path d="M${x + 1.2} ${y + 3.5} V${y + 2.3} a1.8 1.8 0 0 1 3.6 0 V${y + 3.5}" fill="none" stroke="${c}" stroke-width="0.9"/>`
  )
}

function win(
  x,
  stage,
  t,
  { holeLabel = null, holeStyle = 'blue', highlightRendered = false } = {}
) {
  const s = []
  const postC = highlightRendered && stage >= 1 ? t.hi : t.skel
  const navC = highlightRendered && stage === 2 ? t.hi : t.skel
  const cx = x + 0.5,
    cy = WY + 0.5 // crisp 1px strokes
  s.push(
    `<rect x="${x}" y="${WY + 6}" width="${CW}" height="${WH}" rx="10" fill="${t.shadow}" filter="url(#blur)"/>`
  )
  s.push(
    `<rect x="${cx}" y="${cy}" width="${CW - 1}" height="${WH - 1}" rx="10" fill="${t.winFill}" stroke="${t.winStroke}"/>`
  )
  s.push(
    `<path d="M${cx} ${cy + HEAD} V${cy + 10} a9.5 9.5 0 0 1 9.5 -9.5 H${cx + CW - 11} a9.5 9.5 0 0 1 9.5 9.5 V${cy + HEAD} Z" fill="${t.winHead}"/>`
  )
  s.push(
    `<line x1="${cx}" x2="${cx + CW - 1}" y1="${cy + HEAD}" y2="${cy + HEAD}" stroke="${t.winStroke}"/>`
  )
  ;['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) =>
    s.push(
      `<circle cx="${x + PAD + 4.5 + i * 13}" cy="${WY + HEAD / 2 + 0.5}" r="4.5" fill="${c}"/>`
    )
  )
  const px = x + PAD + 48,
    pw = CW - PAD - 48 - PAD,
    ph = 18
  s.push(
    `<rect x="${px + 0.5}" y="${WY + (HEAD - ph) / 2 + 0.5}" width="${pw - 1}" height="${ph}" rx="5" fill="${t.url}" stroke="${t.urlStroke}"/>`
  )
  s.push(lock(px + 9, WY + (HEAD - ph) / 2 + 5, t.urlText))
  s.push(
    `<text x="${px + 20}" y="${WY + HEAD / 2 + 0.5}" dominant-baseline="central" font-size="9.5" fill="${t.urlText}" ${font}>acme.com/blog/my-post</text>`
  )

  const ny = WY + HEAD + PAD
  s.push(
    `<rect x="${x + PAD}" y="${ny}" width="48" height="${NAV_H}" rx="3" fill="${t.skel}"/>`
  )
  s.push(
    `<rect x="${x + CW - PAD - 18 - 10 - 44}" y="${ny}" width="44" height="${NAV_H}" rx="3" fill="${t.skel}"/>`
  )
  s.push(
    `<circle cx="${x + CW - PAD - 9}" cy="${ny + NAV_H / 2}" r="9" fill="${t.skel}"/>`
  )

  const SQ = 22,
    step = (CH - SQ) / 3
  for (let i = 0; i < 4; i++)
    s.push(
      `<rect x="${x + PAD}" y="${CT + i * step}" width="${SQ}" height="${SQ}" rx="4" fill="${t.skel}"/>`
    )

  const mx = x + PAD + SQ + PAD,
    mw = x + CW - PAD - mx
  const grayHole = holeStyle === 'gray'
  const holeText = (y, h) =>
    holeLabel
      ? `<text x="${mx + mw / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="500" fill="${grayHole ? t.barGrayText : t.barBlueText}" ${font}>${holeLabel}</text>`
      : ''
  const dashed = (y, h) =>
    (grayHole
      ? `<rect x="${mx + 0.5}" y="${y + 0.5}" width="${mw - 1}" height="${h - 1}" rx="6" fill="none" stroke="${t.barGrayStroke}" stroke-dasharray="4 3"/>`
      : `<rect x="${mx}" y="${y}" width="${mw}" height="${h}" rx="6" fill="${t.blueFill}" stroke="${t.blue}" stroke-width="1.5" stroke-dasharray="4 3"/>`) +
    holeText(y, h)
  const POST_H = 62
  const postHi = highlightRendered && stage >= 1
  const post = (y) =>
    [
      postHi
        ? `<rect x="${mx}" y="${y}" width="${mw}" height="${POST_H}" rx="6" fill="${t.blueFill}" stroke="${t.blue}" stroke-width="1.5"/>`
        : `<rect x="${mx + 0.5}" y="${y + 0.5}" width="${mw - 1}" height="${POST_H - 1}" rx="6" fill="none" stroke="${t.winStroke}"/>`,
      `<rect x="${mx + 12}" y="${y + 12}" width="84" height="10" rx="3" fill="${postC}"/>`,
      `<rect x="${mx + 12}" y="${y + 32}" width="${mw - 24}" height="6" rx="3" fill="${postC}"/>`,
      `<rect x="${mx + 12}" y="${y + 44}" width="${mw - 64}" height="6" rx="3" fill="${postC}"/>`,
    ].join('')

  if (stage === 0) s.push(dashed(CT, CH))
  if (stage === 1) {
    s.push(post(CT))
    s.push(dashed(CT + POST_H + 8, CH - POST_H - 8))
  }
  if (stage === 2) {
    s.push(post(CT))
    const top = CT + POST_H + 8,
      rows = 3,
      rh = 10
    const rstep = (CB - top - rh) / (rows - 1)
    const widths = [96, 60, 76]
    widths.forEach((w, i) => {
      const y = top + i * rstep
      s.push(`<circle cx="${mx + 5}" cy="${y + rh / 2}" r="5" fill="${navC}"/>`)
      s.push(
        `<rect x="${mx + 16}" y="${y + 2}" width="${w}" height="6" rx="3" fill="${navC}"/>`
      )
    })
  }
  return s.join('\n')
}

function arrow(cx, y, t) {
  const x1 = cx - 14,
    x2 = cx + 14
  return (
    `<line x1="${x1}" x2="${x2 - 1}" y1="${y}" y2="${y}" stroke="${t.arrow}" stroke-width="1.5" stroke-linecap="round"/>` +
    `<path d="M${x2 - 7} ${y - 4.5} L${x2} ${y} L${x2 - 7} ${y + 4.5}" fill="none" stroke="${t.arrow}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
  )
}

function bar(x1, x2, y, kind, t) {
  const cy = y + BAR_H / 2
  const label = barText[kind]
  const text = (color) =>
    `<text x="${x1 + 14}" y="${cy}" dominant-baseline="central" font-size="12.5" font-weight="500" fill="${color}" ${font}>${label}</text>`
  switch (kind) {
    case 'static':
      return (
        `<rect x="${x1 + 0.5}" y="${y + 0.5}" width="${x2 - x1 - 1}" height="${BAR_H - 1}" rx="8" fill="${t.barGray}" stroke="${t.barGrayStroke}"/>` +
        text(t.barGrayText)
      )
    case 'later':
      return (
        `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="${BAR_H}" rx="8" fill="${t.blueFill}" stroke="${t.blue}" stroke-width="1.5" stroke-dasharray="5 4"/>` +
        text(t.barBlueText)
      )
    case 'fallback':
      return (
        `<rect x="${x1 + 0.5}" y="${y + 0.5}" width="${x2 - x1 - 1}" height="${BAR_H - 1}" rx="8" fill="none" stroke="${t.barGrayStroke}" stroke-dasharray="5 4"/>` +
        text(t.barGrayText)
      )
    case 'renders':
      return (
        `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="${BAR_H}" rx="8" fill="${t.blueFill}" stroke="${t.blue}" stroke-width="1.5"/>` +
        text(t.barBlueText)
      )
  }
}

function svg(t, { height: H, rows, ...windowOptions }) {
  const s = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs>
      <pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${t.grid}" stroke-width="1"/></pattern>
      <filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
    </defs>`,
    `<rect width="${W}" height="${H}" fill="${t.bg}"/><rect width="${W}" height="${H}" fill="url(#g)"/>`,
  ]
  const names = ['Shell', 'Prefetch', 'Navigation']
  COLS.forEach((x, i) => {
    s.push(win(x, i, t, windowOptions))
    s.push(
      `<text x="${x + CW / 2}" y="${STAGE_Y}" text-anchor="middle" font-size="16" font-weight="500" fill="${t.label}" ${font}>${names[i]}</text>`
    )
  })
  GAPS.forEach((g) => s.push(arrow(g, WY + WH / 2, t)))

  const SPLIT = 4
  rows.forEach(([label, segments], i) => {
    const y = BAR_Y0 + i * BAR_GAP
    s.push(
      `<text x="${LABEL_X}" y="${y + BAR_H / 2}" text-anchor="end" dominant-baseline="central" font-size="14" fill="${t.code}" ${mono}>${label}</text>`
    )
    let x1 = COLS[0]
    segments.forEach(([kind, gap]) => {
      const x2 = gap === null ? END : GAPS[gap] - SPLIT
      s.push(bar(x1, x2, y, kind, t))
      if (gap !== null) x1 = GAPS[gap] + SPLIT
    })
  })
  s.push('</svg>')
  return s.join('\n')
}

for (const [name, d] of Object.entries(diagrams)) {
  for (const [theme, t] of Object.entries(themes)) {
    fs.mkdirSync(theme, { recursive: true })
    fs.writeFileSync(
      `${name}-${theme}.html`,
      `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=block" rel="stylesheet"><style>html,body{margin:0;background:${t.bg}}svg{display:block}</style></head><body>${svg(t, d)}</body></html>`
    )
    fs.writeFileSync(`${theme}/${name}.svg`, svg(t, d))
  }
}
