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

  // Close the iterator as soon as the signal fires so the for-await loop
  // exits without waiting for the next compilation event.
  signal?.addEventListener('abort', () => iterator.return?.(undefined as any), {
    once: true,
  })

  const promise = (async function () {
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
          // We flush after each event to make sure it makes it to disk.  These events are rare and
          // tend to happen at the very end of a build so to make sure they are logged we need to
          // flush.
          // NOTE: in a `next build` environment where we are reporting events to the parent thread, this is a no-op.
          await flushAllTraces()
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
  // Prevent unhandled rejection if the subscription errors after the project shuts down.
  promise.catch(() => {})
  return promise
}
