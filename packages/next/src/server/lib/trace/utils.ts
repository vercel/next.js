import type { ClientTraceDataEntry } from './tracer'
import type { SpanOptions } from '@opentelemetry/api'

export function getTimestamp(time?: SpanOptions['startTime']): number {
  if (time instanceof Date) {
    return time.getTime()
  }

  if (Array.isArray(time)) {
    return time[0] * 1000 + time[1] / 1_000_000
  }

  if (typeof time === 'number') {
    return time < performance.timeOrigin / 2
      ? performance.timeOrigin + time
      : time
  }

  return performance.timeOrigin + performance.now()
}

export function toHrTime(nanoseconds: bigint): [number, number] {
  return [
    Number(nanoseconds / BigInt(1_000_000_000)),
    Number(nanoseconds % BigInt(1_000_000_000)),
  ]
}

/**
 * Takes OpenTelemetry client trace data and the `clientTraceMetadata` option configured in the Next.js config (currently
 * experimental) and returns a filtered/allowed list of client trace data entries.
 */
export function getTracedMetadata(
  traceData: ClientTraceDataEntry[],
  clientTraceMetadata: string[] | undefined
): ClientTraceDataEntry[] | undefined {
  if (!clientTraceMetadata) return undefined
  return traceData.filter(({ key }) => clientTraceMetadata.includes(key))
}
