import { HMR_MESSAGE_SENT_TO_SERVER } from '../../server/dev/hot-reloader-types'
import type { ReactTimingRecord } from '../../shared/lib/react-debug-timing'
import {
  isBrowserReactTimingRecord,
  MAX_BROWSER_REACT_TIMING_BATCH,
  MAX_BROWSER_REACT_TIMING_MESSAGE_LENGTH,
  MAX_BROWSER_REACT_TIMING_QUEUE,
} from '../../shared/lib/react-debug-timing-transport'

let sendMessage: ((message: string) => boolean | void) | undefined
let nextDecoderId = 0
let nextRecordId = 0
let observer: PerformanceObserver | undefined
const DEBUG_PERFORMANCE_ID_PREFIX = 'next-request-insights:'
// Only primitive records waiting for the initial HMR connection, never decoded
// roots or responses. Bound the number of pending decoders as well as records.
const pending = new Set<() => void>()
let pendingOverflow = false

export function setReactTimingSender(
  sender: ((message: string) => boolean | void) | undefined
): void {
  sendMessage = sender
  if (sender) {
    if (pendingOverflow) {
      pendingOverflow = false
      console.warn(
        '[Request Insights] Some React timings were dropped while the development connection was unavailable.'
      )
    }
    for (const flush of [...pending]) flush()
  }
}

export function createReactDebugPerformanceId(
  requestId: string | undefined
): string | undefined {
  if (!requestId || typeof PerformanceObserver === 'undefined') return
  if (!observer) {
    try {
      observer = new PerformanceObserver((list) => {
        const queues = new Map<string, ReturnType<typeof createTimingQueue>>()
        for (const entry of list.getEntries()) {
          try {
            if (entry.entryType !== 'measure') continue
            const metadata = (entry as PerformanceMeasure).detail?.react
            if (
              metadata?.version !== 1 ||
              typeof metadata.debugPerformanceId !== 'string' ||
              !metadata.debugPerformanceId.startsWith(
                DEBUG_PERFORMANCE_ID_PREFIX
              ) ||
              (metadata.kind !== 'component' && metadata.kind !== 'await') ||
              (metadata.outcome !== 'completed' &&
                metadata.outcome !== 'errored' &&
                metadata.outcome !== 'aborted') ||
              typeof metadata.environment !== 'string'
            )
              continue
            let queue = queues.get(metadata.debugPerformanceId)
            if (!queue) {
              const context: unknown = JSON.parse(
                metadata.debugPerformanceId.slice(
                  DEBUG_PERFORMANCE_ID_PREFIX.length
                )
              )
              if (
                !Array.isArray(context) ||
                context.length !== 2 ||
                typeof context[0] !== 'string' ||
                typeof context[1] !== 'string'
              )
                continue
              if (queues.size >= MAX_BROWSER_REACT_TIMING_BATCH) {
                for (const queued of queues.values()) queued.flush()
                queues.clear()
              }
              queue = createTimingQueue(context[0], context[1])
              queues.set(metadata.debugPerformanceId, queue)
            }
            const componentName = entry.name.replace(/^\u200b/, '')
            queue.record({
              kind: metadata.kind,
              name:
                metadata.kind === 'await'
                  ? 'async work'
                  : componentName
                      .replace(/ \[(?!deduped\])[^\]]+\]$/, '')
                      .slice(0, 256),
              environment: metadata.environment.slice(0, 64),
              outcome: metadata.outcome,
              startTime: performance.timeOrigin + entry.startTime,
              durationMs: entry.duration,
            })
          } catch {
            // User measures can contain arbitrary detail; inspect each independently.
          }
        }
        for (const queue of queues.values()) queue.flush()
      })
      observer.observe({ type: 'measure' })
    } catch {
      observer?.disconnect()
      observer = undefined
      return
    }
  }
  // Encode primitive context so delayed entries do not require retaining decoders.
  return (
    DEBUG_PERFORMANCE_ID_PREFIX +
    JSON.stringify([requestId, String(nextDecoderId++)])
  )
}

function createTimingQueue(requestId: string, decoderId: string) {
  let partial = false
  let partialReported = false
  const records: ReactTimingRecord[] = []

  function flush() {
    if (!sendMessage) {
      if (
        pending.size >= MAX_BROWSER_REACT_TIMING_BATCH &&
        !pending.has(flush)
      ) {
        records.length = 0
        partial = true
        pendingOverflow = true
      } else {
        pending.add(flush)
      }
      return
    }
    pending.delete(flush)
    while (records.length > 0 || (partial && !partialReported)) {
      const batch = records.slice(0, MAX_BROWSER_REACT_TIMING_BATCH)
      const payload = {
        event: HMR_MESSAGE_SENT_TO_SERVER.REACT_DEBUG_TIMINGS,
        requestId,
        decoderId,
        partial: partial || undefined,
        records: batch,
      }
      let message = JSON.stringify(payload)
      while (
        message.length > MAX_BROWSER_REACT_TIMING_MESSAGE_LENGTH &&
        batch.length > 1
      ) {
        batch.pop()
        message = JSON.stringify(payload)
      }
      let sent = false
      try {
        sent = sendMessage(message) !== false
      } catch {
        // A socket can close between readiness checking and send(). Keep this
        // bounded batch for the next connection, without a polling timer.
      }
      if (!sent) {
        sendMessage = undefined
        pending.add(flush)
        return
      }
      records.splice(0, batch.length)
      partialReported ||= partial
    }
  }

  return {
    flush,
    record(timing: Omit<ReactTimingRecord, 'id'>) {
      const record = { ...timing, id: `decoded:${nextRecordId++}` }
      if (
        records.length < MAX_BROWSER_REACT_TIMING_QUEUE &&
        isBrowserReactTimingRecord(record)
      ) {
        records.push(record)
      } else {
        partial = true
      }
    },
  }
}
