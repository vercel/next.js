// The benchmark runner starts a local HTTP server that answers after a
// requested delay. Its origin is passed in through the environment.
export function delayOrigin() {
  const origin = process.env.BENCH_DELAY_ORIGIN
  if (!origin) {
    throw new Error(
      'BENCH_DELAY_ORIGIN is not set. Build this fixture with bench/static-generation/run.mjs'
    )
  }
  return origin
}

// Deterministic pseudo-random number in [0, 1) for a given string.
export function hash01(value) {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}
