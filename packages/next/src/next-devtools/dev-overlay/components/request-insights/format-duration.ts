const SUB_MILLISECOND_DISPLAY_THRESHOLD_MS = 0.1
const FRACTIONAL_MILLISECOND_THRESHOLD_MS = 2

export function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) {
    return '-'
  }

  if (durationMs === 0) {
    return '0 ms'
  }

  if (durationMs > 0 && durationMs < SUB_MILLISECOND_DISPLAY_THRESHOLD_MS) {
    return '<0.1 ms'
  }

  if (durationMs < FRACTIONAL_MILLISECOND_THRESHOLD_MS) {
    return `${durationMs.toFixed(1)} ms`
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`
  }

  return `${(durationMs / 1000).toFixed(2)} s`
}
