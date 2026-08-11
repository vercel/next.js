import {
  createVaryParamsAccumulator,
  type VaryParamsAccumulator,
} from './vary-params'
import type { WorkUnitStore } from './work-unit-async-storage.external'

/**
 * Per-segment state for a single work unit, keyed by an object that is
 * stable and unique per segment: its loader tree node.
 *
 * Everything in here is response-scoped: the map of segment stores hangs off
 * the work unit store, so no field can outlive a single render pass.
 *
 * Fields are owned by their respective domains and accessed through the
 * helpers below; they start `null` and are populated lazily on first use.
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
}

export function getSegmentStore(
  workUnitStore: WorkUnitStore,
  segment: object
): SegmentStore {
  const segmentStores = (workUnitStore.segmentStore ??= new WeakMap())
  let segmentStore = segmentStores.get(segment)
  if (segmentStore === undefined) {
    segmentStore = { varyParamsAccumulator: null }
    segmentStores.set(segment, segmentStore)
  }
  return segmentStore
}

/**
 * The single source of truth for a segment's vary-params accumulator. Created
 * lazily on first access and stored on the segment, so every consumer that
 * tracks the segment's param access shares the one accumulator that ends up
 * embedded in the segment's transport node. Returns `null` when the current
 * render doesn't track vary params.
 *
 * `segment` is the segment's stable key (see `SegmentStore`): its loader tree
 * node.
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
