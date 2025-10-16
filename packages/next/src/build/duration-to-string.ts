// Time thresholds in seconds
const SECONDS_IN_MINUTE = 60
const MINUTES_THRESHOLD_SECONDS = 120 // 2 minutes
const SECONDS_THRESHOLD_HIGH = 40
const SECONDS_THRESHOLD_LOW = 2
const MILLISECONDS_PER_SECOND = 1000

// Time thresholds and conversion factors for nanoseconds
const NANOSECONDS_PER_SECOND = 1_000_000_000
const NANOSECONDS_PER_MILLISECOND = 1_000_000
const NANOSECONDS_PER_MICROSECOND = 1_000
const NANOSECONDS_IN_MINUTE = 60_000_000_000 // 60 * 1_000_000_000
const MINUTES_THRESHOLD_NANOSECONDS = 120_000_000_000 // 2 minutes in nanoseconds
const SECONDS_THRESHOLD_HIGH_NANOSECONDS = 40_000_000_000 // 40 seconds in nanoseconds
const SECONDS_THRESHOLD_LOW_NANOSECONDS = 2_000_000_000 // 2 seconds in nanoseconds
const MILLISECONDS_THRESHOLD_NANOSECONDS = 1_000_000 // 1 millisecond in nanoseconds

export function durationToString(compilerDuration: number) {
  if (compilerDuration > MINUTES_THRESHOLD_SECONDS) {
    return `${(compilerDuration / SECONDS_IN_MINUTE).toFixed(1)}min`
  } else if (compilerDuration > SECONDS_THRESHOLD_HIGH) {
    return `${compilerDuration.toFixed(0)}s`
  } else if (compilerDuration > SECONDS_THRESHOLD_LOW) {
    return `${compilerDuration.toFixed(1)}s`
  } else {
    return `${(compilerDuration * MILLISECONDS_PER_SECOND).toFixed(1)}ms`
  }
}

function durationToStringWithNanoseconds(durationBigInt: bigint): string {
  const duration = Number(durationBigInt)
  if (duration > MINUTES_THRESHOLD_NANOSECONDS) {
    return `${(duration / NANOSECONDS_IN_MINUTE).toFixed(1)}min`
  } else if (duration > SECONDS_THRESHOLD_HIGH_NANOSECONDS) {
    return `${(duration / NANOSECONDS_PER_SECOND).toFixed(0)}s`
  } else if (duration > SECONDS_THRESHOLD_LOW_NANOSECONDS) {
    return `${(duration / NANOSECONDS_PER_SECOND).toFixed(1)}s`
  } else if (duration > MILLISECONDS_THRESHOLD_NANOSECONDS) {
    return `${(duration / NANOSECONDS_PER_MILLISECOND).toFixed(0)}ms`
  } else {
    return `${(duration / NANOSECONDS_PER_MICROSECOND).toFixed(0)}µs`
  }
}

export function hrtimeToSeconds(hrtime: [number, number]): number {
  // hrtime is a tuple of [seconds, nanoseconds]
  return hrtime[0] + hrtime[1] / NANOSECONDS_PER_SECOND
}

export function hrtimeBigIntDurationToString(hrtime: bigint) {
  return durationToStringWithNanoseconds(hrtime)
}

export function hrtimeDurationToString(hrtime: [number, number]): string {
  return durationToString(hrtimeToSeconds(hrtime))
}
