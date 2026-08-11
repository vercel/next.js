import {
  createVaryParamsAccumulator,
  type VaryParamsAccumulator,
} from './vary-params'
import type {
  WorkUnitStore,
  WorkUnitPhase,
} from './work-unit-async-storage.external'

/**
 * Per-segment state for a single work unit, keyed by any object that is
 * stable and unique per segment. Two such objects exist depending on the
 * segment: its loader tree node (used for layouts and by-value pages), or
 * its `searchParams` object (used by pages that receive it by reference —
 * the render pipeline holds the tree node while the reference's dereference
 * only holds the searchParams object, and both are unique per render per
 * segment, so either serves as the rendezvous key).
 *
 * Everything in here is response-scoped: the map of segment stores hangs off
 * the work unit store, so no field can outlive a single render pass.
 *
 * Fields are owned by their respective domains and accessed through the
 * helpers below; both start `null` and are populated lazily on first use.
 * This module only provides the record and its per-(work unit, segment)
 * identity.
 */
export type SegmentStore = {
  /**
   * The segment's vary-params accumulator: tracks which params the segment
   * accessed during a prerender, for the segment's transport node. `null`
   * until first requested, and stays `null` when the current render doesn't
   * track vary params.
   */
  varyParamsAccumulator: VaryParamsAccumulator | null

  /**
   * The promise the segment's params/searchParams reference resolves to,
   * memoized per phase. `null` until the reference is first observed, then a
   * map populated lazily by `getSegmentReferenceValue`. The value is
   * `Promise<SearchParams>` (later also `Promise<Params>`); it's stored
   * untyped because a given segment store entry is keyed by one specific
   * reference and only ever holds that reference's value.
   */
  resolvedByPhase: { [K in WorkUnitPhase]?: Promise<unknown> } | null
}

export function getSegmentStore(
  workUnitStore: WorkUnitStore,
  segment: object
): SegmentStore {
  const segmentStores = (workUnitStore.segmentStore ??= new WeakMap())
  let segmentStore = segmentStores.get(segment)
  if (segmentStore === undefined) {
    segmentStore = { varyParamsAccumulator: null, resolvedByPhase: null }
    segmentStores.set(segment, segmentStore)
  }
  return segmentStore
}

/**
 * The single source of truth for a segment's vary-params accumulator. Created
 * lazily on first access and stored on the segment, so every consumer that
 * tracks the segment's param access — the render pipeline building the segment,
 * and a `searchParams` reference dereferencing against it — shares the one
 * accumulator that ends up embedded in the segment's transport node. Returns
 * `null` when the current render doesn't track vary params.
 *
 * `segment` is the segment's stable key (see `SegmentStore`): its loader tree
 * node, or — for a page received by reference — its `searchParams` object.
 */
export function getSegmentVaryParamsAccumulator(
  workUnitStore: WorkUnitStore,
  segment: object
): VaryParamsAccumulator | null {
  const segmentStore = getSegmentStore(workUnitStore, segment)
  if (segmentStore.varyParamsAccumulator === null) {
    // `createVaryParamsAccumulator` returns `null` when the ambient render
    // isn't tracking vary params. Caching a non-null accumulator keeps it a
    // single create-once (and a single registration into the response
    // accumulator); the `null` case has no side effect, so re-running it on a
    // later access is harmless.
    segmentStore.varyParamsAccumulator = createVaryParamsAccumulator()
  }
  return segmentStore.varyParamsAccumulator
}

/**
 * The single source of truth for the promise a segment's params/searchParams
 * reference resolves to, memoized per phase on the segment store. Created
 * lazily via `resolve` on first observation and reused thereafter, so every
 * observation within a phase hits the *same* promise — required for
 * correctness, not just perf: React's `use()` protocol writes `status`/`value`
 * onto the thenable and re-reads them across suspends, and the staged (Cache
 * Components) resolver returns a fresh promise per call.
 *
 * `segment` is the reference itself (a page's stable per-segment key), so this
 * shares the segment store with `getSegmentVaryParamsAccumulator` — one
 * per-(request, segment) container. Because the store hangs off the work unit
 * store, the memo never leaks into another request.
 *
 * TODO: keying by phase is a code smell — it exists only because a single
 * request store is *mutated* across phases (`action` → `render` → `after`; see
 * `action-handler`) and the same reference can be dereferenced in more than
 * one of them, resolving differently each time. The right fix is a separate
 * WorkUnitStore per phase, so phase is immutable for a store's lifetime and
 * this can drop the phase dimension.
 */
export function getSegmentReferenceValue<T>(
  workUnitStore: WorkUnitStore,
  segment: object,
  resolve: (workUnitStore: WorkUnitStore, segment: object) => Promise<T>
): Promise<T> {
  const segmentStore = getSegmentStore(workUnitStore, segment)
  const byPhase = (segmentStore.resolvedByPhase ??= {})
  const phase = workUnitStore.phase
  const existing = byPhase[phase]
  if (existing !== undefined) {
    return existing as Promise<T>
  }
  const value = resolve(workUnitStore, segment)
  byPhase[phase] = value
  return value
}
