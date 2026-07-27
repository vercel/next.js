import type { ClientTraceDataEntry } from './tracer'

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
