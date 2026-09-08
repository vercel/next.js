import type { OutgoingHttpHeaders } from 'node:http'
import type { PrefetchHints } from '../../shared/lib/app-router-types'

export type RouteMetadata = {
  status: number | undefined
  headers: OutgoingHttpHeaders | undefined
  postponed: string | undefined
  inlineScriptHashes: Array<string> | undefined
  segmentPaths: Array<string> | undefined
  prefetchHints: PrefetchHints | undefined
}
