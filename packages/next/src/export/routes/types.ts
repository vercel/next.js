import type { OutgoingHttpHeaders } from 'node:http'
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
  segmentPaths: Array<string> | undefined
  /** Identifies the response-cache entry represented by this build artifact. */
  routeCache?: RouteCacheMetadata
  /** Original payload mtime retained when a build seed is promoted. */
  routeCacheLastModified?: number
}
