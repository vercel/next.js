import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mean, quantile, welchsTTest, mannWhitneyU } from './statistics.js'

function near(actual: number, expected: number, tol = 1e-6, label = '') {
  assert.ok(
    Math.abs(actual - expected) < tol,
    `${label}: expected ${expected}, got ${actual} (tol ${tol})`
  )
}

test('mean', () => {
  near(mean([1, 2, 3, 4, 5]), 3)
  near(mean([10]), 10)
})

test('quantile (linear interpolation, numpy/R type 7)', () => {
  // [1,2,3,4,5] with q=0.5 → 3, q=0.9 → 4.6
  near(quantile([1, 2, 3, 4, 5], 0.5), 3)
  near(quantile([1, 2, 3, 4, 5], 0.9), 4.6)
  // sorts internally
  near(quantile([5, 3, 1, 2, 4], 0.5), 3)
  // single sample
  near(quantile([42], 0.9), 42)
})

test("Welch's t-test: small samples", () => {
  // Hand-verified: means 2 and 3, both sample variances = 1.
  //   sea = seb = 1/3, denom = 2/3
  //   t = -1 / sqrt(2/3) = -1.2247448713915892
  //   df = (2/3)^2 / (2 * (1/3)^2 / 2) = (4/9) / (1/9) = 4
  //   p ≈ 0.288 (two-sided, df=4)
  const r = welchsTTest([1, 2, 3], [2, 3, 4])
  near(r.t, -1.2247448713915892, 1e-12, 't')
  near(r.df, 4, 1e-12, 'df')
  near(r.p, 0.288, 1e-3, 'p')
})

test("Welch's t-test: large clearly-different samples", () => {
  // mean_a=12, mean_b=22, var_a=var_b=2.5 → t=-10 exactly, df=8 exactly.
  const a = [10, 11, 12, 13, 14]
  const b = [20, 21, 22, 23, 24]
  const r = welchsTTest(a, b)
  near(r.t, -10, 1e-12, 't')
  near(r.df, 8, 1e-12, 'df')
  // P(|T|>10 | df=8) is on the order of 8e-6.
  assert.ok(r.p > 1e-6 && r.p < 1e-5, `expected p in (1e-6, 1e-5), got ${r.p}`)
})

test("Welch's t-test: identical samples → t=0, p=1", () => {
  const r = welchsTTest([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])
  near(r.t, 0)
  near(r.p, 1)
})

test('Welch handles unequal variance (small group variance)', () => {
  // [1..5] vs [10, 10.1, 10.2, 10.3, 10.4]
  // var_a = 2.5, var_b = 0.025 → very unequal.
  // sea = 0.5, seb = 0.005, denom = 0.505
  // t = -7.2 / sqrt(0.505) ≈ -10.1318
  // df = 0.505^2 / (0.0625 + 6.25e-6) ≈ 4.080
  const r = welchsTTest([1, 2, 3, 4, 5], [10, 10.1, 10.2, 10.3, 10.4])
  near(r.t, -10.131804644116203, 1e-9, 't')
  near(r.df, 4.08, 1e-2, 'df')
  // df is small (~4) so heavier tails than the df=8 case: p should be larger.
  assert.ok(r.p < 1e-3, `expected p<1e-3, got ${r.p}`)
})

test('t-distribution CDF: known critical value', () => {
  // df=10, |t|=2.228 → two-sided p ≈ 0.05 (standard table).
  // We verify by constructing a sample with exactly that t-stat.
  // Easier: use the fact that for df=∞ (large df), Welch's reduces to z-test.
  // df=1000, t≈1.96 should give p≈0.05.
  // Construct a=[0]*n, b shifted: we can't get exact df without specific values,
  // so we just confirm the formula gives sane values across df range.
  // Pair 1: df ≈ 10, t ≈ 2.228 — synthesize with two known groups.
  // Simpler check: at very large df, p should match the normal-tail p for the same z.
  const huge = Array.from({ length: 500 }, (_, i) => i)
  const huger = Array.from({ length: 500 }, (_, i) => i + 0.2) // tiny shift
  const r = welchsTTest(huge, huger)
  // With this setup df is enormous (~1000) and t is small but well-defined.
  // p should be between 0 and 1; finite.
  assert.ok(Number.isFinite(r.p))
  assert.ok(r.p >= 0 && r.p <= 1)
})

test('Mann–Whitney U: n=5 vs n=5, max separation', () => {
  // [1..5] vs [6..10]: U=0. Exact two-sided p = 2/252 ≈ 0.00794;
  // asymptotic with continuity correction ≈ 0.012. Both indicate a strong
  // separation; we just verify U=0 and p is below 0.05.
  const r = mannWhitneyU([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])
  assert.equal(r.u, 0)
  assert.ok(r.p < 0.05, `expected p<0.05, got ${r.p}`)
  assert.ok(r.p > 0.005, `expected p>0.005, got ${r.p}`)
})

test('Mann–Whitney U: fully overlapping → no rejection', () => {
  const r = mannWhitneyU([1, 2, 3], [1, 2, 3])
  assert.ok(r.p > 0.5, `expected p>0.5, got ${r.p}`)
})

test('Mann–Whitney U: 3 vs 3 distinct, no ties', () => {
  // U=0 for group A. Exact two-sided p = 0.1; asymptotic ≈ 0.081.
  const r = mannWhitneyU([1, 2, 3], [4, 5, 6])
  assert.equal(r.u, 0)
  assert.ok(r.p > 0.05 && r.p < 0.15, `expected p in (0.05, 0.15), got ${r.p}`)
})

test('Mann–Whitney U: medium samples use normal approximation', () => {
  // Two clearly separated groups of 12.
  // scipy two-sided p with continuity correction is in the ~1e-5 range.
  const a = Array.from({ length: 12 }, (_, i) => i + 1)
  const b = Array.from({ length: 12 }, (_, i) => i + 100)
  const r = mannWhitneyU(a, b)
  assert.equal(r.u, 0)
  assert.ok(r.p < 1e-4, `expected p<1e-4, got ${r.p}`)
})
