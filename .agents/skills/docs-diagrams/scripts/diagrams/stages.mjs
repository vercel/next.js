// Navigation stage strips: three browser windows (Shell → Prefetch → Navigation)
// with bar rows underneath, split at the gaps between windows.
//
// Used by docs/01-app/02-guides/keeping-pages-static.mdx (ensure-static-stage)
// and docs/01-app/02-guides/optimizing-prefetching.mdx (navigation-stage).
// Both are 1200 wide because that is what those pages declare.

const W = 1200
const CW = 256 // window width
const WH = 208 // window height
const COL_GAP = 44
const LABEL_W = 228 // width of "ensureStatic = 'navigation'" at 14px Geist Mono
const LABEL_GAP = 28
const BLOCK_W = LABEL_W + LABEL_GAP + CW * 3 + COL_GAP * 2
const X0 = Math.round((W - BLOCK_W) / 2)
const LABEL_X = X0 + LABEL_W
const COLS = [0, 1, 2].map((i) => LABEL_X + LABEL_GAP + i * (CW + COL_GAP))
const END = COLS[2] + CW
const GAPS = [0, 1].map((i) => COLS[i] + CW + COL_GAP / 2)
const WY = 48
const STAGE_Y = WY + WH + 30
const BAR_Y0 = 332,
  BAR_H = 34,
  BAR_GAP = 58

// One window of the strip. `stage` 0..2 decides how much of the page is in.
function stageWindow(
  x,
  stage,
  t,
  lib,
  { holeLabel, holeStyle, highlightRendered }
) {
  const win = lib.browserWindow(t, x, WY, CW, WH, 'acme.com/blog/my-post')
  const pad = 14
  const navH = 10
  const ny = win.contentY + pad
  const ct = ny + navH + pad // content top
  const cb = WY + WH - pad // content bottom
  const ch = cb - ct
  const s = [win.svg]

  // navbar + sidebar skeletons
  s.push(lib.skel.bar(t, x + pad, ny, 48, navH))
  s.push(lib.skel.bar(t, x + CW - pad - 18 - 10 - 44, ny, 44, navH))
  s.push(lib.skel.avatar(t, x + CW - pad - 9, ny + navH / 2, 9))
  const sq = 22,
    step = (ch - sq) / 3
  for (let i = 0; i < 4; i++)
    s.push(lib.skel.square(t, x + pad, ct + i * step, sq))

  const mx = x + pad + sq + pad,
    mw = x + CW - pad - mx
  const postH = 62
  const postOn = highlightRendered && stage >= 1
  const post = (y) => {
    const c = postOn ? t.blue.skelOn : t.skel
    return (
      (postOn
        ? lib.card(t, mx, y, mw, postH, { radius: 6, strokeWidth: 1.5 })
        : `<rect x="${mx + 0.5}" y="${y + 0.5}" width="${mw - 1}" height="${postH - 1}" rx="6" fill="none" stroke="${t.panelStroke}"/>`) +
      lib.skel.bar(t, mx + 12, y + 12, 84, 10, c) +
      lib.skel.bar(t, mx + 12, y + 32, mw - 24, 6, c) +
      lib.skel.bar(t, mx + 12, y + 44, mw - 64, 6, c)
    )
  }
  const dashed = (y, h) =>
    lib.hole(t, mx, y, mw, h, {
      style: holeStyle,
      label: holeLabel,
      radius: 6,
      strokeWidth: 1.5,
      dash: '4 3',
      labelSize: 11,
    })

  if (stage === 0) s.push(dashed(ct, ch))
  if (stage === 1) {
    s.push(post(ct))
    s.push(dashed(ct + postH + 8, ch - postH - 8))
  }
  if (stage === 2) {
    s.push(post(ct))
    const top = ct + postH + 8,
      rows = 3,
      rh = 10
    const rstep = (cb - top - rh) / (rows - 1)
    const c = highlightRendered ? t.blue.skelOn : t.skel
    ;[96, 60, 76].forEach((w, i) => {
      const y = top + i * rstep
      s.push(lib.skel.avatar(t, mx + 5, y + rh / 2, 5, c))
      s.push(lib.skel.bar(t, mx + 16, y + 2, w, 6, c))
    })
  }
  return s.join('\n')
}

const barText = {
  static: 'Static',
  later: 'Can render later',
  fallback: 'Suspense fallback',
  renders: 'Renders',
}

function bar(x1, x2, y, kind, t, lib) {
  const cy = y + BAR_H / 2
  const text = (color) =>
    lib.label(t, x1 + 14, cy, barText[kind], { size: 12.5, weight: 500, color })
  switch (kind) {
    case 'static':
      return (
        `<rect x="${x1 + 0.5}" y="${y + 0.5}" width="${x2 - x1 - 1}" height="${BAR_H - 1}" rx="8" fill="${t.panelMuted}" stroke="${t.skel}"/>` +
        text(t.gray.text)
      )
    case 'later':
      return (
        lib.card(t, x1, y, x2 - x1, BAR_H, {
          radius: 8,
          dashed: true,
          strokeWidth: 1.5,
          dash: '5 4',
        }) + text(t.blue.text)
      )
    case 'fallback':
      return (
        `<rect x="${x1 + 0.5}" y="${y + 0.5}" width="${x2 - x1 - 1}" height="${BAR_H - 1}" rx="8" fill="none" stroke="${t.skel}" stroke-dasharray="5 4"/>` +
        text(t.gray.text)
      )
    case 'renders':
      return (
        lib.card(t, x1, y, x2 - x1, BAR_H, { radius: 8, strokeWidth: 1.5 }) +
        text(t.blue.text)
      )
  }
}

// rows: [codeLabel, [[kind, endsAtGap | null], ...]]
function strip(t, lib, { rows, ...windowOptions }) {
  const s = []
  const names = ['Shell', 'Prefetch', 'Navigation']
  COLS.forEach((x, i) => {
    s.push(stageWindow(x, i, t, lib, windowOptions))
    s.push(
      lib.label(t, x + CW / 2, STAGE_Y, names[i], {
        size: 16,
        weight: 500,
        color: t.textMuted,
        anchor: 'middle',
      })
    )
  })
  GAPS.forEach((g) =>
    s.push(lib.arrow(t, g - 14, g + 14, WY + WH / 2, { width: 1.5 }))
  )
  const SPLIT = 4
  rows.forEach(([text, segments], i) => {
    const y = BAR_Y0 + i * BAR_GAP
    s.push(
      lib.code(t, LABEL_X, y + BAR_H / 2, text, {
        size: 14,
        color: t.text,
        anchor: 'end',
      })
    )
    let x1 = COLS[0]
    segments.forEach(([kind, gap]) => {
      const x2 = gap === null ? END : GAPS[gap] - SPLIT
      s.push(bar(x1, x2, y, kind, t, lib))
      if (gap !== null) x1 = GAPS[gap] + SPLIT
    })
  })
  return s.join('\n')
}

export default [
  {
    name: 'ensure-static-stage',
    width: W,
    height: 530,
    draw: (t, lib) =>
      strip(t, lib, {
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
      }),
  },
  {
    name: 'navigation-stage',
    width: W,
    height: 480,
    draw: (t, lib) =>
      strip(t, lib, {
        holeLabel: 'Suspense fallback',
        holeStyle: 'gray', // match the "Suspense fallback" bar, so blue only means "Renders"
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
      }),
  },
]
