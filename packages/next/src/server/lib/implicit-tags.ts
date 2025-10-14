import { NEXT_CACHE_IMPLICIT_TAG_ID } from '../../lib/constants'
import type { OpaqueFallbackRouteParams } from '../request/fallback-params'
import { getCacheHandlerEntries } from '../use-cache/handlers'
import { createLazyResult, type LazyResult } from './lazy-result'

export interface ImplicitTags {
  /**
   * For legacy usage, the implicit tags are passed to the incremental cache
   * handler in `get` calls.
   */
  readonly tags: string[]

  /**
   * Modern cache handlers don't receive implicit tags. Instead, the implicit
   * tags' expirations are stored in the work unit store, and used to compare
   * with a cache entry's timestamp.
   *
   * Note: This map contains lazy results so that we can evaluate them when the
   * first cache entry is read. It allows us to skip fetching the expiration
   * values if no caches are read at all.
   */
  readonly expirationsByCacheKind: Map<string, LazyResult<number>>
}

const getDerivedTags = (pathname: string): string[] => {
  const derivedTags: string[] = [`/layout`]

  // we automatically add the current path segments as tags
  // for revalidatePath handling
  if (pathname.startsWith('/')) {
    const pathnameParts = pathname.split('/')

    for (let i = 1; i < pathnameParts.length + 1; i++) {
      let curPathname = pathnameParts.slice(0, i).join('/')

      if (curPathname) {
        // all derived tags other than the page are layout tags
        if (!curPathname.endsWith('/page') && !curPathname.endsWith('/route')) {
          curPathname = `${curPathname}${
            !curPathname.endsWith('/') ? '/' : ''
          }layout`
        }
        derivedTags.push(curPathname)
      }
    }
  }
  return derivedTags
}

/**
 * Creates a map with lazy results that fetch the expiration value for the given
 * tags and respective cache kind when they're awaited for the first time.
 */
function createTagsExpirationsByCacheKind(
  tags: string[]
): Map<string, LazyResult<number>> {
  const expirationsByCacheKind = new Map<string, LazyResult<number>>()
  const cacheHandlers = getCacheHandlerEntries()

  if (cacheHandlers) {
    for (const [kind, cacheHandler] of cacheHandlers) {
      if ('getExpiration' in cacheHandler) {
        expirationsByCacheKind.set(
          kind,
          createLazyResult(async () => cacheHandler.getExpiration(tags))
        )
      }
    }
  }

  return expirationsByCacheKind
}

export async function getImplicitTags(
  page: string,
  url: {
    pathname: string
    search?: string
  },
  fallbackRouteParams: null | OpaqueFallbackRouteParams
): Promise<ImplicitTags> {
  const tags = new Set<string>()

  // Add the derived tags from the page.
  const derivedTags = getDerivedTags(page)
  for (let tag of derivedTags) {
    tag = `${NEXT_CACHE_IMPLICIT_TAG_ID}${tag}`
    tags.add(tag)
  }

  // Add the tags from the pathname. If the route has unknown params, we don't
  // want to add the pathname as a tag, as it will be invalid.
  if (
    url.pathname &&
    (!fallbackRouteParams || fallbackRouteParams.size === 0)
  ) {
    const tag = `${NEXT_CACHE_IMPLICIT_TAG_ID}${url.pathname}`
    tags.add(tag)
  }

  if (tags.has(`${NEXT_CACHE_IMPLICIT_TAG_ID}/`)) {
    tags.add(`${NEXT_CACHE_IMPLICIT_TAG_ID}/index`)
  }

  if (tags.has(`${NEXT_CACHE_IMPLICIT_TAG_ID}/index`)) {
    tags.add(`${NEXT_CACHE_IMPLICIT_TAG_ID}/`)
  }

  const tagsArray = Array.from(tags)
  return {
    tags: tagsArray,
    expirationsByCacheKind: createTagsExpirationsByCacheKind(tagsArray),
  }
}
