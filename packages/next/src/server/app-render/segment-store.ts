import type { VaryParamsAccumulator } from './vary-params'
import type { WorkUnitStore } from './work-unit-async-storage.external'
import type { LoaderTree } from '../lib/app-dir-module'

/**
 * Per-request, per-segment AsyncLocalStorage.
 *
 * Every route segment has its own SegmentStore, accessible via the module graph
 * (the LoaderTree nodes act as the keys into the store). Conceptually it's
 * as if every route module exports its own SegmentStore.
 *
 * The SegmentStore itself is also stored per request via the WorkUnitStore.
 * So it can contain per-request state, like vary param tracking.
 *
 * Fields are owned by their respective domains and accessed through helpers
 * in the owning modules; they start `null` and are populated lazily on first
 * use. This module only provides the record and its per-(work unit, segment)
 * identity.
 *
 * TODO: the segment's `searchParams` and `params` prop objects will move in
 * here too, memoized the same way, so that everything a segment receives
 * from the request is created and accessed through one per-segment store.
 */
export type SegmentStore = {
  /**
   * The segment's vary-params accumulator: tracks which params the segment
   * accessed during a prerender, for the segment's transport node. `null`
   * until first requested, and stays `null` when the current render doesn't
   * track vary params. Created and memoized by the field's owner in
   * `vary-params.ts` (`getSegmentVaryParamsAccumulator`, or
   * `getMetadataVaryParamsAccumulator` for the metadata segment).
   */
  varyParamsAccumulator: VaryParamsAccumulator | null
}

function createSegmentStore(): SegmentStore {
  return { varyParamsAccumulator: null }
}

/**
 * Returns the SegmentStore for a given layout or page segment.
 */
export function getSegmentStore(
  workUnitStore: WorkUnitStore,
  // We use the LoaderTree node as the key into the SegmentStore because it's
  // unique per segment and corresponds directly to the module graph.
  segment: LoaderTree
): SegmentStore {
  const segmentStores = (workUnitStore.segmentStore ??= new WeakMap())
  let segmentStore = segmentStores.get(segment)
  if (segmentStore === undefined) {
    segmentStore = createSegmentStore()
    segmentStores.set(segment, segmentStore)
  }
  return segmentStore
}

/**
 * The metadata "segment": conceptually a segment in almost every way, except
 * it doesn't map to a route segment — it's the same for the whole page. This
 * roughly matches how metadata tracking is modeled on the client. Everything
 * a segment gets (vary-params tracking, props) follows the same patterns
 * through this store.
 *
 * Because it's page-wide, it lives as its own field on the work unit store,
 * next to the route segments' map — mirroring how the response-level
 * structures are laid out (e.g. `ResponseVaryParamsAccumulator.metadata`
 * next to `segments`).
 */
export function getMetadataSegmentStore(
  workUnitStore: WorkUnitStore
): SegmentStore {
  return (workUnitStore.metadataSegmentStore ??= createSegmentStore())
}
