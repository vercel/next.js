import { isBot } from '../../shared/lib/router/utils/is-bot'
import { addBasePath } from '../add-base-path'

export function isExternalURL(url: URL) {
  return url.origin !== window.location.origin
}

/**
 * Given a link href, constructs the URL that should be prefetched. Returns null
 * in cases where prefetching should be disabled, like external URLs, or
 * during development.
 * @param href The href passed to <Link>, router.prefetch(), or similar
 * @returns A URL object to prefetch, or null if prefetching should be disabled
 */
export function createPrefetchURL(href: string): URL | null {
  // Don't prefetch for bots as they don't navigate.
  if (isBot(window.navigator.userAgent)) {
    return null
  }

  let url: URL
  try {
    url = new URL(addBasePath(href), window.location.href)
  } catch (_) {
    // TODO: Does this need to throw or can we just console.error instead? Does
    // anyone rely on this throwing? (Seems unlikely.)
    throw new Error(
      `Cannot prefetch '${href}' because it cannot be converted to a URL.`
    )
  }

  // Don't prefetch during development (improves compilation performance)
  if (process.env.NODE_ENV === 'development') {
    return null
  }

  // External urls can't be prefetched in the same way.
  if (isExternalURL(url)) {
    return null
  }

  return url
}
