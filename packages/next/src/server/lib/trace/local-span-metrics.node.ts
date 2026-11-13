import type { Attributes, Context } from '@opentelemetry/api'

export function reportToolingMeasurements(
  name: string,
  attributes: Attributes,
  context: Context
): void {
  const restart = name === 'server-restart-close-to-memory-threshold'
  const native =
    name === 'turbopack-persistence' || name === 'turbopack-compaction'
  if (!native && name !== 'memory-usage' && !restart) return
  const { api } = require('./otel-api') as typeof import('./otel-api')
  if (!api.metrics) return
  const meter = api.metrics.getMeter('next.js', process.env.__NEXT_VERSION)
  const measurements = native
    ? [
        ['bytes_written', 'turbopack.bytes_written', 'By'],
        ['bytes_deleted', 'turbopack.bytes_deleted', 'By'],
        ['task_count', 'turbopack.task_count', '{task}'],
      ]
    : [
        ['memory.rss', 'memory.rss', 'By'],
        ['memory.heapUsed', 'memory.heap_used', 'By'],
        ['memory.heapTotal', 'memory.heap_total', 'By'],
        ['memory.heapMax', 'memory.heap_limit', 'By'],
        ['memory.heapSizeLimit', 'memory.heap_limit', 'By'],
      ]
  for (const [key, suffix, unit] of measurements) {
    if (attributes[key] === undefined) continue
    const value = Number(attributes[key])
    if (!Number.isFinite(value) || value < 0) continue
    meter
      .createHistogram(`next.tooling.${suffix}`, { unit })
      .record(value, { operation: name }, context)
  }
  if (restart) {
    meter
      .createCounter('next.tooling.server.restarts', { unit: '{restart}' })
      .add(1, { reason: 'memory-threshold' }, context)
  }
}
