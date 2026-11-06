// Node-only local capture and clock/worker adapter. Selected reporting uses the
// application SDK inline after registration; local files never depend on sampling.
import type { TraceEvent, ToolingSpanSelection } from './types'
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

// Browser latency arrives already complete. Keep its lossless source clocks and
// direct selected-parent token, including after that parent's local completion.
export function replayCompletedSpan(
  event: TraceEvent,
  start: bigint,
  end: bigint,
  parent: ReportingRecord | undefined,
  parentId: number | undefined
) {
  replayCompleted(
    [event],
    () => ({ start: epochTime(start), end: epochTime(end) }),
    () => parentId,
    parent
  )
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

export function replayWorkerEvents(
  events: TraceEvent[],
  selections: readonly ToolingSpanSelection[] = []
) {
  const parents = new Map(selections.map(({ id, parentId }) => [id, parentId]))
  const selected = events.filter((event) => parents.has(event.id))
  replayCompleted(
    selected,
    (event) => ({
      start: epochTime(BigInt(event.timestamp) * NS_PER_US),
      end: epochTime(
        (BigInt(event.timestamp) + BigInt(event.duration)) * NS_PER_US
      ),
    }),
    (event) => parents.get(event.id)
  )
}
