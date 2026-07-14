import type { OutgoingHttpHeaders } from 'node:http'
import type { PrefetchHints } from '../../shared/lib/app-router-types'

export type RouteMetadata = {
  status: number | undefined
  headers: OutgoingHttpHeaders | undefined
  postponed: string | undefined
  segmentPaths: Array<string> | undefined
  prefetchHints: PrefetchHints | undefined
  /**
   * Whether the prerendered HTML contains pending UI: Suspense fallbacks
   * that resolve later, either by resuming on the server (postponed) or on
   * the client (e.g. a boundary reading search params). Complete HTML has
   * no pending UI.
   */
  hasPendingUi: boolean | undefined
}
