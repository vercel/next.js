import type { OutgoingHttpHeaders } from 'node:http'
import type { PrefetchHints } from '../../shared/lib/app-router-types'
import type { CacheControl } from '../../server/lib/cache-control'
import type { ResponseCacheOwner } from '../../server/lib/route-cache-key'

export type RouteCacheMetadata = {
  key: string
  owner: ResponseCacheOwner
  isFallback: boolean
}

export type RouteMetadata = {
  status: number | undefined
  headers: OutgoingHttpHeaders | undefined
  postponed: string | undefined
  inlineScriptHashes: Array<string> | undefined
  segmentPaths: Array<string> | undefined
  prefetchHints: PrefetchHints | undefined
  /**
   * The lifetime of an entry written by the incremental cache at runtime, so an
   * instance that did not render it can serve it with the same Cache-Control.
   */
  cacheControl?: CacheControl
  /** Identifies the response-cache entry represented by this build artifact. */
  routeCache?: RouteCacheMetadata
  /**
   * When the incremental cache wrote the entry, on the clock that tag
   * revalidations are stamped with. A promoted build seed keeps the mtime of
   * its payload instead.
   */
  routeCacheLastModified?: number
}
