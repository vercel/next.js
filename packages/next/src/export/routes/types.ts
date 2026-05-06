import type { OutgoingHttpHeaders } from 'node:http'
import type { PrefetchHints } from '../../shared/lib/app-router-types'

/**
 * Per-segment metadata persisted to the `.meta` file. The build adapter
 * reads this to compute the cache-key allowQuery for each segment
 * prerender, instead of inheriting the page-level value.
 */
export type SegmentMetadata = {
  /** Path of the segment within the page's segments directory (e.g. `/_tree`). */
  path: string
  /**
   * Structural vary params for this segment: dynamic path-param names
   * (without the `nxtP` prefix) that are reachable via the `params` prop.
   * `null` means the segment spans the full route — consumers should fall
   * back to the page-level allowQuery.
   */
  structuralVaryParams: Array<string> | null
}

export type RouteMetadata = {
  status: number | undefined
  headers: OutgoingHttpHeaders | undefined
  postponed: string | undefined
  segments: Array<SegmentMetadata> | undefined
  prefetchHints: PrefetchHints | undefined
}
