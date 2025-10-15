export function durationToString(compilerDuration: number) {
  let durationString
  if (compilerDuration > 120) {
    durationString = `${(compilerDuration / 60).toFixed(1)}min`
  } else if (compilerDuration > 40) {
    durationString = `${compilerDuration.toFixed(0)}s`
  } else if (compilerDuration > 2) {
    durationString = `${compilerDuration.toFixed(1)}s`
  } else {
    durationString = `${(compilerDuration * 1000).toFixed(1)}ms`
  }
  return durationString
}

function durationToStringWithNanoseconds(durationBigInt: bigint): string {
  let durationString
  const duration = Number(durationBigInt)
  if (duration > 120000000000) {
    durationString = `${(duration / 60000000000).toFixed(1)}min`
  } else if (duration > 40000000000) {
    durationString = `${(duration / 1000000000).toFixed(0)}s`
  } else if (duration > 2000000000) {
    durationString = `${(duration / 1000000000).toFixed(1)}s`
  } else if (duration > 1000000) {
    durationString = `${(duration / 1000000).toFixed(0)}ms`
  } else {
    durationString = `${(duration / 1000).toFixed(0)}µs`
  }
  return durationString
}

export function hrtimeToSeconds(hrtime: [number, number]): number {
  // hrtime is a tuple of [seconds, nanoseconds]
  return hrtime[0] + hrtime[1] / 1e9
}

export function hrtimeBigIntDurationToString(hrtime: bigint) {
  return durationToStringWithNanoseconds(hrtime)
}

export function hrtimeDurationToString(hrtime: [number, number]): string {
  return durationToString(hrtimeToSeconds(hrtime))
}
