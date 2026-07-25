// Shared statistics for the sandbox bench harnesses.
//
// Unit of analysis: the VM BOOT. Iterations within a boot share JIT
// state, heap layout, host, and phase-sequence position, so they are
// not independent samples (Kalibera & Jones, "Rigorous Benchmarking in
// Reasonable Time"; JMH forks). Each boot contributes ONE delta per
// metric (the mean of its paired within-boot deltas); confidence
// intervals and p-values are computed across boots. Within-boot
// statistics are printed as a diagnostic only — never as the claim.

// Two-sided critical values of Student's t at 97.5% (df 1..30).
const T975 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201,
  2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074,
  2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
]

function tCritical975(df) {
  if (df < 1) return Infinity
  if (df <= 30) return T975[df - 1]
  return 1.96 + 2.4 / df // adequate approximation past df=30
}

// Two-sided p for a one-sample t test against zero, via numerical
// integration of the t pdf (small-df accuracy is what matters here —
// boots are few).
export function tTestP(values) {
  const n = values.length
  if (n < 2) return 1
  if (values.some((v) => !Number.isFinite(v))) return 1
  const mean = values.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)
  )
  if (sd === 0) return mean === 0 ? 1 : 0
  const t = Math.abs(mean / (sd / Math.sqrt(n)))
  const df = n - 1
  if (df === 1) {
    // Student t with df=1 is Cauchy; the closed form avoids the fat
    // tail truncating a numerical integration.
    return Math.min(1, Math.max(0, 1 - (2 / Math.PI) * Math.atan(t)))
  }
  if (!Number.isFinite(t) || t > 45) {
    // p underflows well past any claim threshold; also guards the
    // integration loop below, whose step size vanishes against huge t.
    return 0
  }
  const pdf = (x) => Math.exp(-((df + 1) / 2) * Math.log(1 + (x * x) / df))
  let integral = 0
  const STEP = 0.001
  for (let x = t; x < t + 60; x += STEP) integral += pdf(x + STEP / 2) * STEP
  let norm = 0
  for (let x = 0; x < 80; x += STEP) norm += pdf(x + STEP / 2) * STEP
  return Math.min(1, integral / norm)
}

// Anytime-valid confidence sequence for a running mean (asymptotic CS,
// Waudby-Smith & Ramdas). Unlike a t-CI, this interval is valid at
// EVERY peek simultaneously, so interim displays built on it cannot
// manufacture significance through repeated looking. Tuned to be
// tightest around ~12 boots.
export function confidenceSeq(values, alpha = 0.05) {
  const n = values.length
  // Below 6 samples the estimated variance is too unstable for the
  // asymptotic guarantee; show nothing rather than something wrong.
  if (n < 6) return null
  const mean = values.reduce((a, b) => a + b, 0) / n
  let sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1))
  if (!Number.isFinite(sd)) return null
  // Small-sample variance inflation (t-style): keeps the sequence
  // honest at the n this harness actually runs (6..32 boots).
  sd *= Math.sqrt((n - 1) / Math.max(1, n - 3))
  const nOpt = 16
  const rho2 = (2 * Math.log(2 / alpha)) / nOpt
  const width =
    sd *
    Math.sqrt(
      ((2 * (n * rho2 + 1)) / (n * n * rho2)) *
        Math.log((Math.sqrt(n * rho2 + 1) * 2) / alpha)
    )
  return { mean, lo: mean - width, hi: mean + width, n }
}

// What each metric measures and which direction is an improvement.
// Deltas are always relative (%), so the unit answers "% of what".
export const METRICS = {
  rps: { unit: 'req/s', better: 'higher' },
  docKb: { unit: 'KB', better: 'lower' },
  gzipKb: { unit: 'KB', better: 'lower' },
  flightKb: { unit: 'KB', better: 'lower' },
  median: { unit: 'ms', better: 'lower' },
  mean: { unit: 'ms', better: 'lower' },
  p95: { unit: 'ms', better: 'lower' },
  p99: { unit: 'ms', better: 'lower' },
  ttfb: { unit: 'ms', better: 'lower' },
  gcMs: { unit: 'ms', better: 'lower' },
  p50: { unit: 'ms', better: 'lower' },
  rss: { unit: 'MB', better: 'lower' },
  rssHw: { unit: 'MB peak', better: 'lower' },
}

// One metric in one phase: per-boot arrays of paired deltas in, verdict out.
export function bootLevelStats(perBootDeltas) {
  const boots = perBootDeltas.filter((d) => d.length > 0)
  const bootMeans = boots.map((d) => d.reduce((a, b) => a + b, 0) / d.length)
  const n = bootMeans.length
  if (n === 0) return null
  const mean = bootMeans.reduce((a, b) => a + b, 0) / n
  const all = boots.flat()
  const result = {
    mean,
    boots: n,
    bootMeans,
    pairs: all.length,
    withinP: tTestP(all),
  }
  if (n >= 2) {
    const sd = Math.sqrt(
      bootMeans.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)
    )
    result.ci95 = (tCritical975(n - 1) * sd) / Math.sqrt(n)
    result.p = tTestP(bootMeans)
  } else {
    result.ci95 = Infinity
    result.p = 1
  }
  return result
}

export function formatStat(name, candName, baseName, s) {
  if (s === null) return `  ${name.padEnd(6)} (no data)`
  const pct = (x) => `${(x * 100).toFixed(1)}%`
  const ci = s.ci95 === Infinity ? '±∞' : `±${(s.ci95 * 100).toFixed(1)}`
  const m = METRICS[name]
  const meta = m
    ? ` [${m.unit}; ${s.mean > 0 === (m.better === 'higher') ? 'IMPROVEMENT' : 'regression'} if real]`
    : ''
  // Byte metrics are deterministic per build, so a ±0.0 near-zero cell
  // with p=0 is normal; the absolute values say whether it matters.
  const abs =
    s.absBase !== undefined && m?.unit === 'KB'
      ? ` [${s.absBase.toFixed(1)}KB -> ${s.absCand.toFixed(1)}KB]`
      : ''
  return (
    `  ${name.padEnd(6)} ${candName} vs ${baseName}: ${pct(s.mean)} ${ci}${meta}${abs} ` +
    `(boots=${s.boots}${s.boots < 3 ? ' — TOO FEW FOR CLAIMS' : ''}, p=${s.p.toFixed(4)})` +
    `  perBoot ${s.bootMeans.map((m) => pct(m)).join(' ')}` +
    `  [pairs=${s.pairs} within-run p=${s.withinP.toFixed(4)} — diagnostic only]`
  )
}

// E2e rows: {vm, arm, block, run, route, phase, <metrics...>}. Pairs are
// (vm, block, run); the boot is the vm. Returns nothing; prints.
export function analyzeE2eRows(rows, baseName, candName, metrics) {
  const fps = {}
  for (const r of rows)
    (fps[r.arm] ||= new Set()).add(r.ver ? `${r.fp}/${r.ver}` : `${r.fp}`)
  console.log(
    `\nfingerprints: ${baseName}=${[...(fps[baseName] ?? [])].join(',')} ` +
      `${candName}=${[...(fps[candName] ?? [])].join(',')}`
  )
  if ((fps[baseName]?.size ?? 0) !== 1 || (fps[candName]?.size ?? 0) !== 1) {
    // A VM measured the wrong build; numbers would look official and be
    // meaningless. Refuse instead of printing stats with a warning.
    console.log(
      '!! inconsistent fingerprints within an arm — RESULTS INVALID, no stats'
    )
    process.exitCode = 1
    return false
  }
  const baseFp = [...fps[baseName]][0]?.split('/')[0]
  const candFp = [...fps[candName]][0]?.split('/')[0]
  if (baseFp !== undefined && candFp !== undefined) {
    console.log(
      baseFp === candFp
        ? 'fingerprint files byte-identical between arms (A/A for those files; ' +
            'arms may still differ elsewhere — check version strings)'
        : 'arms differ (A/B mode)'
    )
  }

  // "Absent" must be distinguishable from "identical": metrics the run
  // never captured are named at the end instead of silently missing.
  const captured = new Set()
  for (const phase of [
    ...new Set(rows.map((r) => `${r.route ?? ''} ${r.phase}`)),
  ].sort()) {
    console.log(`\n${phase}`)
    const inPhase = (r) => `${r.route ?? ''} ${r.phase}` === phase
    for (const metric of metrics) {
      const perBoot = []
      const baseVals = []
      const candVals = []
      for (const vm of [...new Set(rows.map((r) => r.vm))]) {
        const deltas = []
        for (const r of rows.filter(
          (x) => x.vm === vm && inPhase(x) && x.arm === candName
        )) {
          const b = rows.find(
            (x) =>
              x.vm === vm &&
              inPhase(x) &&
              x.arm === baseName &&
              x.block === r.block &&
              x.run === r.run
          )
          if (b && b[metric] > 0 && r[metric] > 0) {
            deltas.push((r[metric] - b[metric]) / b[metric])
            baseVals.push(b[metric])
            candVals.push(r[metric])
          }
        }
        perBoot.push(deltas)
      }
      const s = bootLevelStats(perBoot)
      if (s !== null && s.pairs > 0) {
        captured.add(metric)
        s.absBase = baseVals.reduce((a, b) => a + b, 0) / baseVals.length
        s.absCand = candVals.reduce((a, b) => a + b, 0) / candVals.length
        console.log(formatStat(metric, candName, baseName, s))
      }
    }
  }
  const absent = metrics.filter((m) => !captured.has(m))
  if (absent.length > 0) {
    console.log(`\nnot captured on this run: ${absent.join(', ')}`)
  }
  return true
}
