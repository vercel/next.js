import type { OutgoingHttpHeaders } from 'node:http'
import type { PrefetchHints } from '../../shared/lib/app-router-types'
import type { CacheControl } from '../../server/lib/cache-control'

export type RouteMetadata = {
  status: number | undefined
  headers: OutgoingHttpHeaders | undefined
  postponed: string | undefined
  segmentPaths: Array<string> | undefined
  prefetchHints: PrefetchHints | undefined
  /**
   * The lifetime of an entry written by the incremental cache at runtime, so an
   * instance that did not render it can serve it with the same Cache-Control.
   */
  cacheControl?: CacheControl
}
