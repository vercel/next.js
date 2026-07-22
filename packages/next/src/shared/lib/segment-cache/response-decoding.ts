/**
 * Response Decoding
 *
 * Low-level helpers for decoding prefetch and navigation responses: the
 * isPartial marker byte, vary params, stale times, and the earliest deferred
 * render stage. Several of these fields are serialized as Flight thenables or
 * async iterables that are read *synchronously* after the response stream has
 * been fully buffered; the shared mechanics for that live here too (see
 * `readFlightChunkValue`).
 *
 * This module is shared between server and client, with one caveat: the
 * staleTime/isPartial helpers (`STATIC_STALETIME_MS`, `getStaleAtFromHeader`,
 * `stripIsPartialByte`) depend on define-env values
 * (`__NEXT_CLIENT_ROUTER_STATIC_STALETIME`,
 * `__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS`) that only exist in user-bundled
 * client code, so those exports are client-only. The vary-params and
 * `readEarliestDeferredRenderStage` exports (and the `readFlightChunkValue`
 * machinery they share) are safe in pre-compiled server internals
 * (collect-segment-data imports them).
 */

import { RenderStage } from '../render-stage'
import { NEXT_ROUTER_STALE_TIME_HEADER } from '../../../client/components/app-router-headers'
import type { RSCResponse } from '../../../client/components/router-reducer/fetch-server-response'

export type VaryParams = Set<string>

/**
 * Vary params are serialized into the Flight stream as an
 * `AsyncIterable<string>` that yields each accessed param name exactly once
 * (the server dedupes before emitting). Because each access is flushed into the
 * stream as it happens, there's no step at the end of the render that has to
 * run for the client to read anything. If a prerender is aborted by sync I/O,
 * the params yielded before the abort are already in the stream, and they're
 * exactly the params the partial response actually depends on.
 *
 * Root params are NOT included in a segment's own iterable. They're emitted
 * once at the top level of the response (as a separate iterable) and unioned in
 * by `readVaryParams`, because root params can be accessed at any point during
 * the render — folding them into every segment would otherwise require a merge
 * once the whole render is complete.
 */
export type VaryParamsIterable = AsyncIterable<string>

/**
 * A Flight "chunk": when a serialized Promise (or an `AsyncIterable`'s
 * iterator result) arrives over a fully-buffered Flight stream, the decoded
 * value is a thenable that follows the React thenable protocol — once
 * `status` is `'fulfilled'`, `value` can be read synchronously.
 */
type FlightChunk<T> = PromiseLike<T> & {
  status?: 'pending' | 'resolved_model' | 'fulfilled' | 'rejected' | string
  value?: T
}

const noop = () => {}

/**
 * Synchronously reads a Flight thenable's fulfilled value, or returns
 * `undefined` if the value isn't synchronously available (pending, rejected,
 * or a native Promise).
 *
 * By the time this runs, the Flight stream has been fully buffered, so the
 * value is either already materialized or will never be (e.g. the render
 * aborted on sync I/O and left the row halted). We force the chunk to resolve
 * synchronously using the same `.then(noop)` trick React uses internally: a
 * freshly-arrived chunk may be in an intermediate 'resolved_model' state (data
 * received but not unwrapped); calling `.then()` transitions it to
 * 'fulfilled', making the value available synchronously. (A native Promise
 * has no `status` and simply reads as not-fulfilled, so this can never hang.)
 */
function readFlightChunkValue<T>(thenable: PromiseLike<T>): T | undefined {
  const chunk = thenable as FlightChunk<T>
  chunk.then(noop, noop)
  if (chunk.status !== 'fulfilled') {
    return undefined
  }
  return chunk.value
}

/**
 * Synchronously drains a vary params `AsyncIterable`, adding each yielded name
 * to `target`.
 *
 * We add "every param yielded up to the point the stream suspends": a
 * normally-closed iterable drains fully, while one left hanging (a sync-I/O
 * abort, or a `close()` whose row hasn't flushed yet) drains to the prefix
 * already in the stream. Both are correct — a segment's param accesses are all
 * flushed as they happen during its render, so the prefix is exactly the set
 * the response depends on. We therefore never need the terminating `done` row
 * to be present; it's only stream hygiene.
 */
function drainVaryParams(
  iterable: VaryParamsIterable,
  target: VaryParams
): void {
  const iterator = iterable[Symbol.asyncIterator]()
  while (true) {
    const step = readFlightChunkValue(iterator.next())
    if (step === undefined) {
      // The stream suspended here. Everything yielded before this point has
      // already been added.
      return
    }
    if (step.done) {
      return
    }
    target.add(step.value)
  }
}

/**
 * Reads a segment's (or the head's) vary params, unioning in the response-level
 * root params.
 *
 * Root params are emitted once at the top level rather than folded into every
 * segment by the server, so every read recombines them here — building the
 * merge into the read means a caller can't forget it, and it's done in a single
 * pass with no intermediate set.
 *
 * Returns null ("unknown", key on all params) unless BOTH iterables are
 * present. A null/absent `iterable` means the segment's own tracking wasn't
 * enabled (e.g. not a prerender). A null/absent `rootIterable` means root
 * params weren't tracked — and since a segment's own iterable never includes
 * root params (those are accessed in layouts above it), narrowing on the
 * segment set alone would wrongly assume no root params were accessed. In
 * either case we stay conservative.
 *
 * When both are present each is authoritative even when it drains to the empty
 * set — a tracked segment that read no params, with no root params accessed,
 * can be shared across all param values.
 */
export function readVaryParams(
  iterable: VaryParamsIterable | null | undefined,
  rootIterable: VaryParamsIterable | null | undefined
): VaryParams | null {
  if (
    iterable === null ||
    iterable === undefined ||
    rootIterable === null ||
    rootIterable === undefined
  ) {
    return null
  }
  const varyParams: VaryParams = new Set()
  drainVaryParams(iterable, varyParams)
  drainVaryParams(rootIterable, varyParams)
  return varyParams
}

/**
 * Synchronously reads the `earliestDeferredRenderStage` field (`n`) of a
 * runtime prefetch response: the earliest render stage whose content was
 * deferred during the server render (e.g. `RenderStage.Dynamic` if at least
 * one `unstable_navigation()` call hung), or `null` if nothing was deferred.
 *
 * The field is promise-valued and resolved by the server at the end of the
 * render (next to where `resultIsPartial` is finalized). By the time we read
 * it, the response stream has been fully buffered/consumed, so the promise is
 * either already settled or will never settle (the render aborted on sync IO
 * and left the row halted — same failure mode as the `u`/`l`/`a` promises in
 * NavigationFlightResponse). If the value isn't available — the field is
 * absent entirely (old server), or present but its row never resolved
 * (halted row, native promise still pending) — we conservatively report
 * `RenderStage.Dynamic` — assume content was deferred at the navigation
 * gate — which records the entry at the requested depth, exactly the behavior
 * before this field existed.
 */
export function readEarliestDeferredRenderStage(
  earliestDeferredRenderStage: Promise<RenderStage | null> | undefined
): RenderStage | null {
  if (earliestDeferredRenderStage === undefined) {
    // The response doesn't include the field (old server). Assume deferred.
    return RenderStage.Dynamic
  }
  const value = readFlightChunkValue(earliestDeferredRenderStage)
  if (typeof value !== 'number' && value !== null) {
    // The promise never resolved (aborted render) or hasn't resolved yet.
    // Assume deferred.
    return RenderStage.Dynamic
  }
  return value
}

/**
 * Ensures a minimum stale time of 30s to avoid issues where the server sends a too
 * short-lived stale time, which would prevent anything from being prefetched.
 */
export function getStaleTimeMs(staleTimeSeconds: number): number {
  return Math.max(staleTimeSeconds, 30) * 1000
}

// This value is set by `define-env-plugin` (based on
// `nextConfig.experimental.staleTimes`) and defaults to 5 minutes.
export const STATIC_STALETIME_MS = getStaleTimeMs(
  Number(process.env.__NEXT_CLIENT_ROUTER_STATIC_STALETIME)
)

export function getStaleAtFromHeader(
  now: number,
  response: RSCResponse<unknown>
): number {
  const staleTimeSeconds = parseInt(
    response.headers.get(NEXT_ROUTER_STALE_TIME_HEADER) ?? '',
    10
  )

  const staleTimeMs = !isNaN(staleTimeSeconds)
    ? getStaleTimeMs(staleTimeSeconds)
    : STATIC_STALETIME_MS

  return now + staleTimeMs
}

/**
 * Strips the leading isPartial byte from an RSC response stream.
 *
 * The server prepends a single byte: '~' (0x7e) for partial, '#' (0x23) for
 * complete. These bytes cannot appear as the first byte of a valid RSC Flight
 * response (Flight rows start with a hex digit or ':').
 *
 * If the first byte is not a recognized marker, the stream is returned intact
 * and `isPartial` is determined by the cachedNavigations experimental flag.
 */
export async function stripIsPartialByte(
  stream: ReadableStream<Uint8Array>
): Promise<{ stream: ReadableStream<Uint8Array>; isPartial: boolean }> {
  // When there is no recognized marker byte, the fallback depends on whether
  // Cached Navigations is enabled. When enabled, dynamic navigation responses
  // don't have a marker but may contain dynamic holes, so they are treated as
  // partial. When disabled, unmarked responses are treated as non-partial.
  const defaultIsPartial = !!process.env.__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS

  const reader = stream.getReader()
  const { done, value } = await reader.read()

  if (done || !value || value.byteLength === 0) {
    return {
      stream: new ReadableStream({ start: (c) => c.close() }),
      isPartial: defaultIsPartial,
    }
  }

  const firstByte = value[0]
  const hasMarker = firstByte === 0x23 || firstByte === 0x7e
  const isPartial = hasMarker ? firstByte === 0x7e : defaultIsPartial

  const remainder = hasMarker
    ? value.byteLength > 1
      ? value.subarray(1)
      : null
    : value

  return {
    isPartial,
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        if (remainder) {
          controller.enqueue(remainder)
        }
      },
      async pull(controller) {
        const result = await reader.read()
        if (result.done) {
          controller.close()
        } else {
          controller.enqueue(result.value)
        }
      },
    }),
  }
}
