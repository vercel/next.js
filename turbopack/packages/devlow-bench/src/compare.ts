import picocolors from 'picocolors'
import { SnapshotRow } from './snapshot.js'
import { mannWhitneyU, quantile } from './statistics.js'
import { formatUnit } from './units.js'

const { bold, dim, green, red, underline } = picocolors

const SIGNIFICANCE_THRESHOLD = 0.05

type RowVerdict = 'improved' | 'regressed' | undefined

interface FormattedRow {
  cells: string[]
  verdict: RowVerdict
}

export interface SampleGroup {
  scenario: string
  variant: string
  metric: string
  unit: string
  samples: number[]
}

// Groups SnapshotRows into per-(scenario, variant, metric) sample arrays.
// Skips rows whose value is non-finite (e.g. failed CSV parse).
export function groupRows(rows: SnapshotRow[]): Map<string, SampleGroup> {
  const out = new Map<string, SampleGroup>()
  for (const r of rows) {
    if (!Number.isFinite(r.value)) continue
    const key = makeKey(r.scenario, r.variant, r.metric)
    let group = out.get(key)
    if (!group) {
      group = {
        scenario: r.scenario,
        variant: r.variant,
        metric: r.metric,
        unit: r.unit,
        samples: [],
      }
      out.set(key, group)
    }
    group.samples.push(r.value)
  }
  return out
}

export function makeKey(
  scenario: string,
  variant: string,
  metric: string
): string {
  return `${scenario}\x00${variant}\x00${metric}`
}

// Prints the comparison table comparing baseline (A) to current (B).
// Reports series only in one side and unit mismatches separately.
export function printComparison(
  baseline: Map<string, SampleGroup>,
  current: Map<string, SampleGroup>,
  options: { baselineLabel: string; currentLabel?: string } = {
    baselineLabel: 'baseline',
  }
): void {
  const { baselineLabel, currentLabel } = options
  console.log()
  if (currentLabel) {
    console.log(
      bold(underline(`Comparison: ${baselineLabel} → ${currentLabel}`))
    )
  } else {
    console.log(bold(underline(`Comparison vs baseline: ${baselineLabel}`)))
  }

  const pairs: { base: SampleGroup; cur: SampleGroup }[] = []
  const onlyInCurrent: string[] = []
  const onlyInBaseline: string[] = []
  const skippedMismatch: string[] = []

  for (const [key, cur] of current) {
    const base = baseline.get(key)
    if (!base) {
      onlyInCurrent.push(`${cur.scenario} · ${cur.variant} · ${cur.metric}`)
      continue
    }
    if (base.unit !== cur.unit) {
      skippedMismatch.push(
        `${cur.scenario} · ${cur.variant} · ${cur.metric} (baseline=${base.unit}, current=${cur.unit})`
      )
      continue
    }
    pairs.push({ base, cur })
  }
  for (const [key, base] of baseline) {
    if (!current.has(key)) {
      onlyInBaseline.push(`${base.scenario} · ${base.variant} · ${base.metric}`)
    }
  }

  // Hoist the most common sample count for each side into a banner above the
  // table; per-row `(n)` is then shown only for rows that deviate from it,
  // so the eye-catching exceptions aren't drowned in repeated `(7)`s.
  const baseMode = modeN(pairs.map((p) => p.base.samples.length))
  const curMode = modeN(pairs.map((p) => p.cur.samples.length))

  if (pairs.length > 0) {
    if (baseMode != null && curMode != null) {
      const banner =
        baseMode === curMode
          ? `n = ${baseMode} per metric`
          : `baseline n = ${baseMode}, current n = ${curMode}`
      console.log(bold(banner))
    }
    const header = [
      'Scenario · Variant',
      'Metric',
      'Baseline p50 / p90 / p99',
      'Current p50 / p90 / p99',
      'Δ p50',
      'Δ%',
      'p',
    ]
    const rows = pairs.map(({ base, cur }) =>
      formatRow(base, cur, baseMode, curMode)
    )
    printTable(header, rows)
  } else {
    console.log(
      dim(
        'No matching (scenario, variant, metric) tuples between current and baseline.'
      )
    )
  }

  logList('Only in current', onlyInCurrent)
  logList('Only in baseline', onlyInBaseline)
  logList('Skipped due to unit mismatch', skippedMismatch, Infinity)
}

function logList(label: string, items: string[], max: number = 5): void {
  if (items.length === 0) return
  const shown = items.slice(0, max).join(', ')
  const suffix = items.length > max ? '…' : ''
  console.log(dim(`${label} (${items.length}): ${shown}${suffix}`))
}

// Picks the most common n in the list. Ties are broken in favor of the
// larger n (treat "the typical fully-collected sample count" as the default).
// Returns null for an empty list.
function modeN(ns: number[]): number | null {
  if (ns.length === 0) return null
  const counts = new Map<number, number>()
  for (const n of ns) counts.set(n, (counts.get(n) ?? 0) + 1)
  let bestN = ns[0]
  let bestCount = 0
  for (const [n, c] of counts) {
    if (c > bestCount || (c === bestCount && n > bestN)) {
      bestN = n
      bestCount = c
    }
  }
  return bestN
}

function formatRow(
  base: SampleGroup,
  cur: SampleGroup,
  baseMode: number | null,
  curMode: number | null
): FormattedRow {
  const bs = percentiles(base.samples)
  const cs = percentiles(cur.samples)
  const delta = cs.p50 - bs.p50
  const deltaPct = bs.p50 === 0 ? NaN : (delta / bs.p50) * 100
  const mwu = mannWhitneyU(base.samples, cur.samples)
  // Color verdict uses Mann–Whitney U's p as the significance signal, with
  // the sign of the p50 shift determining improvement vs regression.
  let verdict: RowVerdict
  if (Number.isFinite(mwu.p) && mwu.p < SIGNIFICANCE_THRESHOLD && delta !== 0) {
    verdict = delta < 0 ? 'improved' : 'regressed'
  }
  return {
    cells: [
      `${base.scenario} · ${base.variant}`,
      base.metric,
      formatGroupCell(base, bs, base.samples.length !== baseMode),
      formatGroupCell(cur, cs, cur.samples.length !== curMode),
      formatDelta(delta, base.unit),
      Number.isFinite(deltaPct) ? `${deltaPct.toFixed(1)}%` : 'n/a',
      formatP(mwu.p),
    ],
    verdict,
  }
}

function percentiles(samples: number[]): {
  p50: number
  p90: number
  p99: number
} {
  return {
    p50: quantile(samples, 0.5),
    p90: quantile(samples, 0.9),
    p99: quantile(samples, 0.99),
  }
}

function formatGroupCell(
  group: SampleGroup,
  s: { p50: number; p90: number; p99: number },
  showN: boolean
): string {
  const parts = [s.p50, s.p90, s.p99].map((v) =>
    splitFormattedUnit(v, group.unit)
  )
  const nSuffix = showN ? ` (${group.samples.length})` : ''
  // If all three values render with the same unit suffix (e.g. all "requests"),
  // only print the suffix on the last value to avoid "7 req / 7 req / 7 req".
  if (
    parts[0].suffix === parts[1].suffix &&
    parts[1].suffix === parts[2].suffix
  ) {
    return `${parts[0].num} / ${parts[1].num} / ${parts[2].num}${parts[2].suffix}${nSuffix}`
  }
  return `${parts[0].num}${parts[0].suffix} / ${parts[1].num}${parts[1].suffix} / ${parts[2].num}${parts[2].suffix}${nSuffix}`
}

function splitFormattedUnit(
  value: number,
  unit: string
): { num: string; suffix: string } {
  const formatted = formatUnit(value, unit)
  const m = /^(-?\d+(?:\.\d+)?)(.*)$/.exec(formatted)
  if (!m) return { num: formatted, suffix: '' }
  return { num: m[1], suffix: m[2] }
}

function formatDelta(d: number, unit: string): string {
  if (!Number.isFinite(d)) return 'n/a'
  const sign = d > 0 ? '+' : ''
  return `${sign}${formatUnit(d, unit)}`
}

function formatP(p: number): string {
  if (!Number.isFinite(p)) return String(p)
  if (p === 0) return '0'
  if (p < 1e-3) return p.toExponential(2)
  return p.toFixed(3)
}

function printTable(header: string[], rows: FormattedRow[]) {
  const widths = header.map((h) => h.length)
  for (const r of rows) {
    for (let i = 0; i < r.cells.length; i++) {
      if (r.cells[i].length > widths[i]) widths[i] = r.cells[i].length
    }
  }
  const pad = (s: string, w: number) => s + ' '.repeat(w - s.length)
  const line = (cells: string[], paint: (s: string) => string = (s) => s) =>
    '| ' + cells.map((c, i) => paint(pad(c, widths[i]))).join(' | ') + ' |'
  const sep = '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|'
  console.log(line(header))
  console.log(sep)
  for (const r of rows) {
    const paint =
      r.verdict === 'improved'
        ? green
        : r.verdict === 'regressed'
          ? red
          : undefined
    console.log(line(r.cells, paint))
  }
}
