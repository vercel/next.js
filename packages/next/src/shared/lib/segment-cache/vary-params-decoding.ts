/**
 * Vary Params Decoding
 *
 * This module is shared between server and client.
 */

import { readFulfilledValue } from '../rsc-transport'

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
 * Synchronously drains a vary params `AsyncIterable`, adding each yielded name
 * to `target`.
 *
 * By the time this runs (on the client, or in collectSegmentData), the Flight
 * stream has been fully buffered, so every yielded value is already
 * materialized and can be read without awaiting: each iterator result is a
 * Flight chunk whose settled state `readFulfilledValue` reads off the
 * thenable's status.
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
    const step = readFulfilledValue(iterator.next(), undefined)
    if (step === undefined || step.done) {
      // Either the stream suspended here — everything yielded before this
      // point has already been added — or the iterable finished cleanly.
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
