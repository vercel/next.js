import type {
  TraceMemorySummary,
  TraceSpanInfo,
  TraceSpanSampleSeries,
} from '../../build/swc/generated-native'

/** Public MCP shape: summaries always, value arrays only on explicit request. */
type JsonSpanInfo = Omit<TraceSpanInfo, 'sampleSeries' | 'children'> &
  Partial<TraceSpanSampleSeries> & { children: JsonSpanInfo[] }

export function serializeTraceSpan(span: TraceSpanInfo): JsonSpanInfo {
  const { sampleSeries, children, ...info } = span
  return {
    ...info,
    ...sampleSeries,
    children: children.map(serializeTraceSpan),
  }
}

export function renderMemorySummary(
  summary: TraceMemorySummary | undefined,
  formatBytes: (bytes: number) => string
): string | null {
  if (!summary) return null
  const delta = summary.end - summary.start
  const deltaSign = delta >= 0 ? '+' : '-'
  return (
    `samples=${summary.count}, peak=${formatBytes(summary.peak)}, min=${formatBytes(summary.min)}, ` +
    `start=${formatBytes(summary.start)}, end=${formatBytes(summary.end)}, ` +
    `Δ=${deltaSign}${formatBytes(Math.abs(delta))}, maxPressure=${summary.maxPressure}`
  )
}

export function renderSampleSeriesMarkdown(
  series: TraceSpanSampleSeries | undefined,
  formatBytes: (bytes: number) => string
): string {
  if (!series || Object.values(series).every((values) => values.length === 0)) {
    return ''
  }

  let md =
    '\n**Sample values:** Memory/pressure/workers use recorded sample groups; concurrency uses equal-time segments. Indices are not shared timestamps.\n'
  const metrics: [string, number[], (value: number) => string][] = [
    ['Memory (TurboMalloc live bytes)', series.memorySamples, formatBytes],
    ['Memory pressure', series.memoryPressureSamples, (value) => `${value}%`],
    ['Active Tokio workers', series.activeWorkerThreadsSamples, String],
    ['Concurrency', series.concurrencySamples, (value) => value.toFixed(2)],
  ]
  for (const [name, values, format] of metrics) {
    md += `\n**${name}:**\n\n`
    if (values.length === 0) {
      md += '_No samples._\n'
      continue
    }
    md += '| Sample | Value |\n| ---: | ---: |\n'
    for (const [index, value] of values.entries()) {
      md += `| ${index + 1} | ${format(value)} |\n`
    }
  }
  return md
}
