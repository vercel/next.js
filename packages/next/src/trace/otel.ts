// Node-only app-tracer pairing. Local spans keep their existing timing, IDs and
// reporter, independently of application sampling (as in Request Insights).
import type { HrTime } from '@opentelemetry/api'
import type { TraceEvent } from './types'
import {
  configureReporting,
  startReporting,
  endReporting,
  replayCompleted,
} from './otel-reporting'
import type { ReportingRecord } from './otel-reporting'
export {
  enableReporting,
  flushReporting,
  updateReporting,
} from './otel-reporting'

const NS_PER_SECOND = BigInt(1_000_000_000)
const NS_PER_MS = BigInt(1_000_000)
const NS_PER_US = BigInt(1_000)
let epochOffset = BigInt(Date.now()) * NS_PER_MS - process.hrtime.bigint()

export function epochTime(monotonic: bigint): HrTime {
  const ns = monotonic + epochOffset
  return [Number(ns / NS_PER_SECOND), Number(ns % NS_PER_SECOND)]
}

export function startSpan(options: {
  name: string
  id: number
  parentId?: number
  attrs: Record<string, unknown>
  startTime: bigint
  reportingParent?: ReportingRecord
}): ReportingRecord | undefined {
  return startReporting(
    options.id,
    options.parentId,
    options.name,
    epochTime(options.startTime),
    options.attrs,
    options.reportingParent
  )
}

export function stopSpan(
  record: ReportingRecord | undefined,
  stopTime: bigint
) {
  endReporting(record, epochTime(stopTime))
}

export function getClockOffset() {
  return epochOffset.toString()
}

export function configureState(
  parentId: number | undefined,
  worker: boolean,
  clockOffset?: string
) {
  if (clockOffset) epochOffset = BigInt(clockOffset)
  configureReporting(parentId, worker)
}

let importedThrough = 0
export function freshWorkerEvents(events: TraceEvent[]) {
  const fresh = events.filter((event) => event.id > importedThrough)
  for (const event of fresh)
    importedThrough = Math.max(importedThrough, event.id)
  return fresh
}

export function replayWorkerEvents(events: TraceEvent[]) {
  replayCompleted(events, (event) => ({
    start: epochTime(BigInt(event.timestamp) * NS_PER_US),
    end: epochTime(BigInt(event.timestamp + event.duration) * NS_PER_US),
  }))
}
