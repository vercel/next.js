import type { ReactTimingRecord } from './react-debug-timing'

export const MAX_BROWSER_REACT_TIMING_BATCH = 32
export const MAX_BROWSER_REACT_TIMING_MESSAGE_LENGTH = 64 * 1024
export const MAX_BROWSER_REACT_TIMING_QUEUE = 256

function isText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    !/[\r\n\0]/.test(value)
  )
}

export function isBrowserReactTimingRecord(
  value: unknown
): value is ReactTimingRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as ReactTimingRecord
  return (
    isText(record.id, 64) &&
    /^decoded:(0|[1-9]\d{0,15})$/.test(record.id) &&
    Number.isSafeInteger(Number(record.id.slice(8))) &&
    (record.kind === 'component' || record.kind === 'await') &&
    isText(record.name, 256) &&
    isText(record.environment, 64) &&
    (record.outcome === undefined ||
      record.outcome === 'completed' ||
      record.outcome === 'errored' ||
      record.outcome === 'aborted') &&
    (record.ownerName === undefined || isText(record.ownerName, 256)) &&
    (record.componentPath === undefined ||
      isText(record.componentPath, 2048)) &&
    Number.isFinite(record.startTime) &&
    record.startTime >= 0 &&
    record.startTime <= Number.MAX_SAFE_INTEGER &&
    Number.isFinite(record.durationMs) &&
    record.durationMs >= 0 &&
    record.durationMs <= 24 * 60 * 60 * 1000 &&
    (record.source === undefined ||
      (record.source !== null &&
        typeof record.source === 'object' &&
        isText(record.source.file, 2048) &&
        isText(record.source.methodName, 256) &&
        Number.isSafeInteger(record.source.line) &&
        record.source.line >= 0 &&
        Number.isSafeInteger(record.source.column) &&
        record.source.column >= 0))
  )
}

export function copyBrowserReactTimingRecord(
  record: ReactTimingRecord
): ReactTimingRecord {
  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    environment: record.environment,
    outcome: record.outcome,
    ownerName: record.ownerName,
    componentPath: record.componentPath,
    startTime: record.startTime,
    durationMs: record.durationMs,
    source: record.source && {
      file: record.source.file,
      methodName: record.source.methodName,
      line: record.source.line,
      column: record.source.column,
    },
  }
}
