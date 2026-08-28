export interface CrunchResult {
  rows: number
  averageMs: number
  p95Ms: number
}

/**
 * Aggregates a latency CSV of the form `route,latency_ms` (with a header
 * row) into summary statistics. Pure function so it can run anywhere.
 */
export function crunchCsv(csv: string): CrunchResult {
  const lines = csv
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1)

  const latencies = lines
    .map((line) => Number.parseFloat(line.split(',')[1] ?? ''))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)

  if (latencies.length === 0) {
    return { rows: 0, averageMs: 0, p95Ms: 0 }
  }

  const total = latencies.reduce((sum, value) => sum + value, 0)
  const p95Index = Math.min(
    latencies.length - 1,
    Math.ceil(latencies.length * 0.95) - 1
  )

  return {
    rows: latencies.length,
    averageMs: Math.round(total / latencies.length),
    p95Ms: Math.round(latencies[p95Index]),
  }
}
