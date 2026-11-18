const MAX_SAMPLE_DURATION_NS = BigInt(1_000_000)

export function getTraceClock(): {
  monotonic: bigint
  wallTimeMs: number
} {
  let monotonic = process.hrtime.bigint()
  let wallTimeMs = Date.now()
  let duration = process.hrtime.bigint() - monotonic

  // A descheduled process can read clocks tens of milliseconds apart.
  for (
    let attempt = 1;
    duration > MAX_SAMPLE_DURATION_NS && attempt < 3;
    attempt++
  ) {
    const nextMonotonic = process.hrtime.bigint()
    const nextWallTimeMs = Date.now()
    const nextDuration = process.hrtime.bigint() - nextMonotonic
    if (nextDuration < duration) {
      monotonic = nextMonotonic
      wallTimeMs = nextWallTimeMs
      duration = nextDuration
    }
  }

  return { monotonic, wallTimeMs }
}
