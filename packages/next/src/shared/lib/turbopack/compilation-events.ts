import type { Project } from '../../../build/swc/types'
import * as Log from '../../../build/output/log'
import { flushAllTraces, type Span } from '../../../trace'
import { traceMemoryUsage } from '../../../lib/memory/trace'

const MILLISECONDS_IN_NANOSECOND = BigInt(1_000_000)
export function msToNs(ms: number): bigint {
  return BigInt(Math.floor(ms)) * MILLISECONDS_IN_NANOSECOND
}

/**
 * Subscribes to compilation events for `project` and prints them using the
 * `Log` library.
 *
 * When `parentSpan` is provided, `TraceEvent` compilation events are recorded
 * as trace spans in the `.next/trace` file.
 *
 * Returns a promise that resolves when the subscription ends.  Abort the
 * `signal` to close the underlying async iterator and settle the promise
 * promptly.  The iterator also closes automatically when the Rust side
 * drops the subscription (e.g. after project shutdown).
 */
export function backgroundLogCompilationEvents(
  project: Project,
  {
    eventTypes,
    signal,
    parentSpan,
  }: { eventTypes?: string[]; signal?: AbortSignal; parentSpan?: Span } = {}
): Promise<void> {
  const iterator = project.compilationEventsSubscribe(eventTypes)
  let abortStarted = false
  let abortReturn: Promise<IteratorResult<unknown>> | undefined

  // If there is no signal assume there will be no clean shutdown,
  // to ensure trace spans aren't lost just flush after each one.
  const flushEachTraceEvent = signal === undefined

  // Close the iterator as soon as the signal fires so the for-await loop
  // exits without waiting for the next compilation event.
  const handleAbort = () => {
    if (abortStarted) return
    abortStarted = true
    try {
      abortReturn = iterator.return
        ? Promise.resolve(iterator.return(undefined as never))
        : Promise.resolve({ done: true, value: undefined })
    } catch (error) {
      abortReturn = Promise.reject(error)
    }
    // The loop normally observes the same close failure. Observe this owner
    // independently in case an iterator reports it only to return().
    void abortReturn.catch(() => {})
  }

  const loop = (async function () {
    for await (const event of iterator) {
      // Record TraceEvent compilation events as trace spans in .next/trace.
      if (parentSpan && event.typeName === 'TraceEvent' && event.eventJson) {
        try {
          const data = JSON.parse(event.eventJson)
          parentSpan.manualTraceChild(
            data.name,
            msToNs(data.startTimeMs),
            msToNs(data.endTimeMs),
            Object.fromEntries(data.attributes ?? [])
          )
          traceMemoryUsage(data.name, parentSpan)
          if (flushEachTraceEvent) {
            flushAllTraces()
          }
        } catch {}
        continue // don't log these events, they just go to the trace file
      }

      switch (event.severity) {
        case 'EVENT':
          Log.event(event.message)
          break
        case 'TRACE':
          Log.trace(event.message)
          break
        case 'INFO':
          Log.info(event.message)
          break
        case 'WARNING':
          Log.warn(event.message)
          break
        case 'ERROR':
          Log.error(event.message)
          break
        case 'FATAL':
          Log.error(event.message)
          break
        default:
          break
      }
    }
  })()
  if (signal) {
    if (signal.aborted) {
      handleAbort()
    } else {
      signal.addEventListener('abort', handleAbort, { once: true })
      // Abort events are not replayed. Close a race between the initial state
      // check and listener installation, with handleAbort remaining idempotent.
      if (signal.aborted) handleAbort()
    }
  }

  const promise = loop
    .then(
      async () => {
        await abortReturn
      },
      async (error) => {
        await abortReturn?.catch(() => {})
        throw error
      }
    )
    .finally(() => signal?.removeEventListener('abort', handleAbort))
  // Prevent unhandled rejection if the subscription errors after the project shuts down.
  void promise.catch(() => {})
  return promise
}
