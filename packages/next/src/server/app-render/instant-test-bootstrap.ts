import {
  RSC_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_RSC_UNION_QUERY,
  NEXT_INSTANT_TEST_COOKIE,
} from '../../client/components/app-router-headers'
import { computeCacheBustingSearchParam } from '../../shared/lib/router/utils/cache-busting-search-param'

/**
 * Builds the inline bootstrap script content for the Instant Navigation Testing
 * API. It is embedded via React's `bootstrapScriptContent` into the prerendered
 * shell (and dynamic renders) so that it ends up in the cached static prelude
 * and runs before the client bootstrap module (app-index) reads
 * self.__next_instant_test as its hydration source.
 *
 * The script is cookie-guarded so it is inert unless the instant test cookie is
 * present (the prelude is shared across all requests). The fetch mirrors the
 * __NEXT_CLIENT_RESUME prefetch used for fallback routes; the instant test
 * cookie rides along on the same-origin request, so the server returns
 * static-only data, which doubles as the feature flag (truthy = instant mode).
 */
export async function getInstantTestBootstrapScriptContent(): Promise<string> {
  const segmentPath = '/_full'
  const cacheBustingHeader = await computeCacheBustingSearchParam(
    '1',
    segmentPath,
    undefined,
    undefined
  )
  const searchStr = `${NEXT_RSC_UNION_QUERY}=${cacheBustingHeader}`
  return `if(document.cookie.indexOf('${NEXT_INSTANT_TEST_COOKIE}=')>-1){self.__next_instant_test=fetch(location.pathname+'?${searchStr}',{credentials:'same-origin',headers:{'${RSC_HEADER}':'1','${NEXT_ROUTER_PREFETCH_HEADER}':'1','${NEXT_ROUTER_SEGMENT_PREFETCH_HEADER}':'${segmentPath}'}})}`
}
