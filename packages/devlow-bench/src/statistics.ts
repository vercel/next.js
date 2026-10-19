// Statistics helpers for repeated-sampling benchmarks.
//
// We use `jstat` for the underlying distribution CDFs (Student's t and
// standard normal). The rest — Welch's t-statistic, average-rank ranking,
// and the Mann–Whitney U statistic + asymptotic-tail p-value — is
// implemented here directly.
//
// For Mann–Whitney we use the normal approximation with continuity
// correction. For very small samples this approximation is less accurate
// (n=5 vs n=5 has a minimum exact two-sided p ≈ 0.008 vs the
// approximation's ≈ 0.012). Document this at the call site, not here.
import jstat from 'jstat'

export interface Summary {
  mean: number
  p50: number
  p90: number
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

// Linear-interpolation quantile (numpy/R "type 7" default).
export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN
  if (xs.length === 1) return xs[0]
  const sorted = [...xs].sort((a, b) => a - b)
  const pos = q * (sorted.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo])
}

export function summary(samples: number[]): Summary {
  return {
    mean: mean(samples),
    p50: quantile(samples, 0.5),
    p90: quantile(samples, 0.9),
  }
}

export interface WelchsTResult {
  t: number
  df: number
  p: number
}

// Two-sample Welch's t-test (unequal variances, two-sided).
export function welchsTTest(a: number[], b: number[]): WelchsTResult {
  if (a.length < 2 || b.length < 2) return { t: NaN, df: NaN, p: NaN }
  if (allEqual(a) && allEqual(b)) {
    const ma = a[0]
    const mb = b[0]
    return {
      t: ma === mb ? 0 : ma > mb ? Infinity : -Infinity,
      df: NaN,
      p: ma === mb ? 1 : 0,
    }
  }
  const ma = mean(a)
  const mb = mean(b)
  const va = sampleVariance(a, ma)
  const vb = sampleVariance(b, mb)
  const na = a.length
  const nb = b.length
  const sea = va / na
  const seb = vb / nb
  const t = (ma - mb) / Math.sqrt(sea + seb)
  // Welch–Satterthwaite degrees of freedom.
  const df =
    (sea + seb) ** 2 / ((sea * sea) / (na - 1) + (seb * seb) / (nb - 1))
  const p = 2 * (1 - jstat.studentt.cdf(Math.abs(t), df))
  return { t, df, p }
}

export interface MannWhitneyResult {
  u: number
  p: number
}

// Two-sided Mann–Whitney U test, asymptotic with continuity correction.
export function mannWhitneyU(a: number[], b: number[]): MannWhitneyResult {
  const na = a.length
  const nb = b.length
  if (na === 0 || nb === 0) return { u: NaN, p: NaN }

  const combined = [...a, ...b]
  const r = averageRanks(combined)
  let rankSumA = 0
  for (let i = 0; i < na; i++) rankSumA += r[i]
  const uA = rankSumA - (na * (na + 1)) / 2
  const uB = na * nb - uA
  const u = Math.min(uA, uB)

  const meanU = (na * nb) / 2
  const sd = Math.sqrt((na * nb * (na + nb + 1)) / 12)
  if (sd === 0) return { u, p: 1 }
  const z = Math.max(0, (Math.abs(uA - meanU) - 0.5) / sd)
  const p = 2 * (1 - jstat.normal.cdf(z, 0, 1))
  return { u, p: Math.min(1, Math.max(0, p)) }
}

// Average-rank ranking (R/scipy default tie correction): tied values share
// the mean of the ranks they would have received.
function averageRanks(xs: number[]): number[] {
  const n = xs.length
  const idx: [number, number][] = xs.map((v, i) => [v, i])
  idx.sort((p, q) => p[0] - q[0])
  const r = new Array<number>(n)
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg
    i = j + 1
  }
  return r
}

function sampleVariance(xs: number[], m: number): number {
  let s = 0
  for (const x of xs) {
    const d = x - m
    s += d * d
  }
  return s / (xs.length - 1)
}

function allEqual(xs: number[]): boolean {
  for (let i = 1; i < xs.length; i++) if (xs[i] !== xs[0]) return false
  return true
}
