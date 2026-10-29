// Node-only local capture and clock/worker adapter. API/SDK work belongs to the
// deferred consumer; local recording remains independent of app sampling.
import type { TraceEvent } from './types'
import {
  configureReporting,
  startReporting,
  endReporting,
  replayCompleted,
} from './otel-reporting'
import type { ReportingRecord } from './otel-reporting'
export { enableReporting, flushReporting } from './otel-reporting'

const NS_PER_MS = BigInt(1_000_000)
const NS_PER_US = BigInt(1_000)
let epochOffset = BigInt(Date.now()) * NS_PER_MS - process.hrtime.bigint()

export function epochTime(monotonic: bigint): bigint {
  return monotonic + epochOffset
}

export function startSpan(options: {
  name: string
  id: number
  parentId?: number
  startTime: bigint
  reportingParent?: ReportingRecord
  reportingRoot?: boolean
}): ReportingRecord | undefined {
  return startReporting(
    options.id,
    options.parentId,
    options.name,
    epochTime(options.startTime),
    options.reportingParent,
    options.reportingRoot
  )
}

export function stopSpan(
  record: ReportingRecord | undefined,
  stopTime: bigint,
  tags: Record<string, unknown>
) {
  endReporting(record, epochTime(stopTime), tags)
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
    end: epochTime(
      (BigInt(event.timestamp) + BigInt(event.duration)) * NS_PER_US
    ),
  }))
}
