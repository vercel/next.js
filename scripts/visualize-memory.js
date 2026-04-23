#!/usr/bin/env node
/**
 * Visualize memory benchmark output as an SVG chart.
 *
 * Usage:
 *   node scripts/visualize-memory.js [--time|--compile] [--out=output.svg] <file1.csv> [file2.csv ...]
 *
 * Modes:
 *   --time     (default) X-axis is elapsed time in seconds. Vertical dashed
 *              lines mark compile events, labeled with the route path.
 *   --compile  X-axis is compile index. Each tick is a route (labeled).
 *              Y-value is the memory sample taken closest to that compile.
 *              Good for comparing per-route memory cost across runs without
 *              timing noise.
 *
 * Memory metric:
 *   Uses physical footprint (footprint_kb) when available (macOS), otherwise
 *   falls back to RSS (rss_kb) on Linux.
 *
 * CSV format (from benchmark-memory.js):
 *   timestamp, elapsed_ms, rss_kb, vsz_kb, footprint_kb, event
 */

const fs = require('fs')
const path = require('path')

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error(
    'Usage: node scripts/visualize-memory.js [--time|--compile] [--out=output.svg] <file1.csv> ...'
  )
  process.exit(1)
}

let outFile = '/tmp/memory-chart.svg'
let mode = 'time' // 'time' | 'compile'
const csvFiles = []

for (const arg of args) {
  if (arg === '--time') mode = 'time'
  else if (arg === '--compile') mode = 'compile'
  else if (arg.startsWith('--out=')) outFile = arg.slice('--out='.length)
  else csvFiles.push(arg)
}

if (csvFiles.length === 0) {
  console.error('Error: no CSV files specified.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const COLORS = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#9333ea',
  '#ea580c',
  '#0891b2',
]

// ---------------------------------------------------------------------------
// Parse CSV
// ---------------------------------------------------------------------------

function parseCsv(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n')
  const header = lines[0].split(',').map((h) => h.trim())
  const hasFootprint = header.includes('footprint_kb')

  // { elapsed_ms, mem_mb, compile? }
  // compile is set on rows that have a compile:<page> annotation
  const rows = []

  for (const line of lines.slice(1)) {
    const cols = line.split(',')
    const elapsed_ms = Number(cols[1])
    const rss_kb = cols[2]?.trim()
    const footprint_kb = hasFootprint ? cols[4]?.trim() : ''
    const event = (hasFootprint ? cols[5] : cols[4])?.trim() ?? ''

    const memKb = hasFootprint && footprint_kb ? footprint_kb : rss_kb
    if (!memKb) continue

    const row = { elapsed_ms, mem_mb: Number(memKb) / 1024 }
    if (event.startsWith('compile:')) {
      // compile:<page> — page is already a route path like "/blog/[slug]"
      row.compile = event.slice('compile:'.length)
    }
    rows.push(row)
  }

  // Separate samples and compile events
  const samples = rows.filter((r) => !r.compile)
  const compileRows = rows.filter((r) => r.compile)

  // For each compile event, find the nearest sample by elapsed_ms
  const compilePoints = compileRows.map((c) => {
    const nearest = samples.reduce((best, s) =>
      Math.abs(s.elapsed_ms - c.elapsed_ms) <
      Math.abs(best.elapsed_ms - c.elapsed_ms)
        ? s
        : best
    )
    return {
      elapsed_ms: c.elapsed_ms,
      label: c.compile,
      mem_mb: nearest.mem_mb,
    }
  })

  // Session boundary points: first sample before any compile, last sample overall
  const firstCompileMs =
    compilePoints.length > 0 ? compilePoints[0].elapsed_ms : Infinity
  const startMem =
    samples.find((s) => s.elapsed_ms <= firstCompileMs)?.mem_mb ??
    samples[0]?.mem_mb
  const endMem = samples[samples.length - 1]?.mem_mb

  return {
    samples,
    compilePoints,
    startMem,
    endMem,
    name: path.basename(filePath, '.csv'),
    metricLabel: hasFootprint ? 'Physical Footprint (MB)' : 'RSS (MB)',
  }
}

// ---------------------------------------------------------------------------
// Chart dimensions
// ---------------------------------------------------------------------------

const W = 1100
const H = 500
const PAD = { top: 40, right: 180, bottom: 80, left: 70 }
const CW = W - PAD.left - PAD.right
const CH = H - PAD.top - PAD.bottom

function escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// Shared y-axis helpers
// ---------------------------------------------------------------------------

function yBounds(datasets) {
  const all = [
    ...datasets.flatMap((d) => d.samples.map((s) => s.mem_mb)),
    ...datasets.flatMap((d) => d.compilePoints.map((c) => c.mem_mb)),
    ...datasets.map((d) => d.startMem ?? 0),
    ...datasets.map((d) => d.endMem ?? 0),
  ]
  return Math.ceil(Math.max(...all, 1) / 100) * 100
}

function yScale(mb, ceil) {
  return PAD.top + CH - (mb / ceil) * CH
}

function yGridLines(ceil) {
  const out = []
  const steps = 5
  for (let i = 0; i <= steps; i++) {
    const mb = (ceil / steps) * i
    const y = yScale(mb, ceil).toFixed(1)
    out.push(
      `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + CW}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`
    )
    out.push(
      `<text x="${(PAD.left - 8).toFixed(1)}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="11" fill="#6b7280">${mb.toFixed(0)}</text>`
    )
  }
  return out.join('\n')
}

function legend(datasets) {
  const items = []
  const x = PAD.left + CW + 16
  let y = PAD.top + 12
  for (const [i, d] of datasets.entries()) {
    const color = COLORS[i % COLORS.length]
    items.push(
      `<rect x="${x}" y="${y - 4}" width="18" height="3" fill="${color}" rx="1"/>`
    )
    items.push(
      `<text x="${x + 24}" y="${y}" font-size="12" fill="#374151" dominant-baseline="middle">${escXml(d.name)}</text>`
    )
    y += 24
  }
  return items.join('\n')
}

function svgWrap(title, xAxisLabel, metricLabel, body, datasets) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">
  <rect width="${W}" height="${H}" fill="white"/>
  <text x="${PAD.left + CW / 2}" y="22" text-anchor="middle" font-size="14" font-weight="600" fill="#111827">${escXml(title)}</text>
  <text x="${(PAD.left - 48).toFixed(1)}" y="${(PAD.top + CH / 2).toFixed(1)}" text-anchor="middle" font-size="12" fill="#6b7280" transform="rotate(-90,${(PAD.left - 48).toFixed(1)},${(PAD.top + CH / 2).toFixed(1)})">${escXml(metricLabel)}</text>
  <text x="${(PAD.left + CW / 2).toFixed(1)}" y="${(H - 6).toFixed(1)}" text-anchor="middle" font-size="12" fill="#6b7280">${escXml(xAxisLabel)}</text>
  <rect x="${PAD.left}" y="${PAD.top}" width="${CW}" height="${CH}" fill="none" stroke="#d1d5db" stroke-width="1"/>
  ${body}
  ${legend(datasets)}
</svg>`
}

// ---------------------------------------------------------------------------
// --time mode
// ---------------------------------------------------------------------------

function renderTime(datasets) {
  const ceil = yBounds(datasets)
  const maxMs = Math.max(
    ...datasets.flatMap((d) => d.samples.map((s) => s.elapsed_ms)),
    1
  )

  function xScale(ms) {
    return PAD.left + (ms / maxMs) * CW
  }

  // Grid
  const grid = [yGridLines(ceil)]
  const xSteps = 6
  for (let i = 0; i <= xSteps; i++) {
    const ms = (maxMs / xSteps) * i
    const x = xScale(ms).toFixed(1)
    grid.push(
      `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + CH}" stroke="#e5e7eb" stroke-width="1"/>`,
      `<text x="${x}" y="${(PAD.top + CH + 16).toFixed(1)}" text-anchor="middle" font-size="11" fill="#6b7280">${(ms / 1000).toFixed(1)}s</text>`
    )
  }

  // Compile markers — one set, deduplicated across all datasets, labeled on x-axis
  // Collect all compiles across datasets, dedup by label, pick earliest elapsed_ms
  const compileByLabel = new Map()
  for (const d of datasets) {
    for (const c of d.compilePoints) {
      if (
        !compileByLabel.has(c.label) ||
        c.elapsed_ms < compileByLabel.get(c.label).elapsed_ms
      ) {
        compileByLabel.set(c.label, c)
      }
    }
  }

  const MIN_GAP_PX = 24
  let lastX = -MIN_GAP_PX * 2
  const markers = []
  for (const c of [...compileByLabel.values()].sort(
    (a, b) => a.elapsed_ms - b.elapsed_ms
  )) {
    const x = xScale(c.elapsed_ms)
    if (x - lastX < MIN_GAP_PX) continue
    lastX = x
    markers.push(
      `<line x1="${x.toFixed(1)}" y1="${PAD.top}" x2="${x.toFixed(1)}" y2="${(PAD.top + CH).toFixed(1)}" stroke="#9ca3af" stroke-width="1" stroke-dasharray="4,3"/>`,
      `<text transform="translate(${(x + 3).toFixed(1)},${(PAD.top + CH + 4).toFixed(1)}) rotate(-45)" font-size="9" fill="#6b7280">${escXml(c.label)}</text>`
    )
  }

  // Lines
  const lines = []
  for (const [i, d] of datasets.entries()) {
    const color = COLORS[i % COLORS.length]
    const pts = d.samples
      .map(
        (s) =>
          `${xScale(s.elapsed_ms).toFixed(1)},${yScale(s.mem_mb, ceil).toFixed(1)}`
      )
      .join(' ')
    if (pts) {
      lines.push(
        `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
      )
    }
  }

  const body = [...grid, ...markers, ...lines].join('\n  ')
  const metricLabel = datasets[0]?.metricLabel ?? 'Memory (MB)'
  return svgWrap(
    'Memory Over Time',
    'Time (seconds)',
    metricLabel,
    body,
    datasets
  )
}

// ---------------------------------------------------------------------------
// --compile mode
// ---------------------------------------------------------------------------

function renderCompile(datasets) {
  const ceil = yBounds(datasets)

  // Use the shortest run so all datasets have values at every tick
  const maxCompiles = Math.min(...datasets.map((d) => d.compilePoints.length))
  if (maxCompiles === 0) {
    console.error('No compile events found in CSV files.')
    process.exit(1)
  }

  // Total ticks: start + compiles + end
  const total = 1 + maxCompiles + 1

  // x: evenly spaced. index 0 = start, 1..maxCompiles = compile #, maxCompiles+1 = end
  function xScale(idx) {
    return PAD.left + (idx / (total - 1)) * CW
  }

  // X-axis tick labels: 'start', '1', '2', ..., 'end'
  const grid = [yGridLines(ceil)]
  for (let i = 0; i < total; i++) {
    const x = xScale(i).toFixed(1)
    const label = i === 0 ? 'start' : i === total - 1 ? 'end' : String(i)
    grid.push(
      `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${(PAD.top + CH).toFixed(1)}" stroke="#e5e7eb" stroke-width="1"/>`,
      `<text x="${x}" y="${(PAD.top + CH + 14).toFixed(1)}" text-anchor="middle" font-size="10" fill="${i === 0 || i === total - 1 ? '#374151' : '#6b7280'}" font-weight="${i === 0 || i === total - 1 ? '600' : '400'}">${escXml(label)}</text>`
    )
  }

  // Lines + dots
  const elems = []
  for (const [i, d] of datasets.entries()) {
    const color = COLORS[i % COLORS.length]

    const pts = []

    // start
    if (d.startMem != null) pts.push([xScale(0), yScale(d.startMem, ceil)])

    // one point per compile in order (capped at maxCompiles)
    for (const [ci, c] of d.compilePoints.slice(0, maxCompiles).entries()) {
      pts.push([xScale(ci + 1), yScale(c.mem_mb, ceil)])
    }

    // end
    if (d.endMem != null) pts.push([xScale(total - 1), yScale(d.endMem, ceil)])

    if (pts.length > 1) {
      const ptStr = pts
        .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
        .join(' ')
      elems.push(
        `<polyline points="${ptStr}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
      )
    }
    for (const [x, y] of pts) {
      elems.push(
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}"/>`
      )
    }
  }

  const body = [...grid, ...elems].join('\n  ')
  const metricLabel = datasets[0]?.metricLabel ?? 'Memory (MB)'
  return svgWrap('Memory Per Compile', 'Compile #', metricLabel, body, datasets)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const datasets = csvFiles.map(parseCsv)

if (mode === 'compile' && datasets.length > 1) {
  const reference = datasets[0]
  for (const d of datasets.slice(1)) {
    const refLabels = reference.compilePoints.map((c) => c.label)
    const dLabels = d.compilePoints.map((c) => c.label)
    const len = Math.min(refLabels.length, dLabels.length)
    for (let i = 0; i < len; i++) {
      if (refLabels[i] !== dLabels[i]) {
        console.error(
          `Error: compile order mismatch between "${reference.name}" and "${d.name}" at position ${i + 1}:\n` +
            `  ${reference.name}: ${refLabels[i]}\n` +
            `  ${d.name}:          ${dLabels[i]}`
        )
        process.exit(1)
      }
    }
    if (refLabels.length !== dLabels.length) {
      console.error(
        `Warning: "${reference.name}" has ${refLabels.length} compiles but "${d.name}" has ${dLabels.length}. ` +
          `Extra compiles in the longer run will be omitted from the comparison.`
      )
    }
  }
}

const svg = mode === 'compile' ? renderCompile(datasets) : renderTime(datasets)
fs.writeFileSync(outFile, svg)
console.log(`Chart written to: ${outFile}`)
