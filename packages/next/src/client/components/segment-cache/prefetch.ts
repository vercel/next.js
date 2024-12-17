import { createPrefetchURL } from '../../components/app-router'
import { createCacheKey } from './cache-key'
import { schedulePrefetchTask } from './scheduler'

/**
 * Entrypoint for prefetching a URL into the Segment Cache.
 * @param href - The URL to prefetch. Typically this will come from a <Link>,
 * or router.prefetch. It must be validated before we attempt to prefetch it.
 */
export function prefetch(href: string, nextUrl: string | null) {
  const url = createPrefetchURL(href)
  if (url === null) {
    // This href should not be prefetched.
    return
  }
  const cacheKey = createCacheKey(url.href, nextUrl)
  schedulePrefetchTask(cacheKey)
}
