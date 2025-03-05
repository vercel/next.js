import { NEXT_CACHE_IMPLICIT_TAG_ID } from '../../lib/constants'
import type { FallbackRouteParams } from '../request/fallback-params'
import { getCacheHandlers } from '../use-cache/handlers'

export interface ImplicitTags {
  /**
   * For legacy usage, the implicit tags are passed to the incremental cache
   * handler in `get` calls.
   */
  readonly tags: string[]
  /**
   * Modern cache handlers don't receive implicit tags. Instead, the
   * implicit tags' expiration is stored in the work unit store, and used to
   * compare with a cache entry's timestamp.
   */
  expiration: number
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

async function getImplicitTagsExpiration(tags: string[]): Promise<number> {
  // We're starting off with assuming that implicit tags are not expired, so we
  // use an artificial timestamp of 0.
  let expiration = 0

  const cacheHandlers = getCacheHandlers()

  if (cacheHandlers) {
    const expirations = await Promise.all(
      [...cacheHandlers].map((handler) => handler.getExpiration(...tags))
    )

    // We use the most recent expiration from all cache handlers, i.e. the
    // largest timestamp. Semantically, they should all be the same though.
    expiration = Math.max(...expirations)
  }

  return expiration
}

/**
 * Fetches a new expiration value for the given `implicitTags`, and mutates its
 * `expiration` property.
 */
export async function updateImplicitTagsExpiration(
  implicitTags: ImplicitTags
): Promise<void> {
  implicitTags.expiration = await getImplicitTagsExpiration(implicitTags.tags)
}

export async function getImplicitTags(
  page: string,
  url: {
    pathname: string
    search?: string
  },
  fallbackRouteParams: null | FallbackRouteParams
): Promise<ImplicitTags> {
  // TODO: Cache the result
  const tags: string[] = []
  const hasFallbackRouteParams =
    fallbackRouteParams && fallbackRouteParams.size > 0

  // Add the derived tags from the page.
  const derivedTags = getDerivedTags(page)
  for (let tag of derivedTags) {
    tag = `${NEXT_CACHE_IMPLICIT_TAG_ID}${tag}`
    tags.push(tag)
  }

  // Add the tags from the pathname. If the route has unknown params, we don't
  // want to add the pathname as a tag, as it will be invalid.
  if (url.pathname && !hasFallbackRouteParams) {
    const tag = `${NEXT_CACHE_IMPLICIT_TAG_ID}${url.pathname}`
    tags.push(tag)
  }

  const expiration = await getImplicitTagsExpiration(tags)

  return { tags, expiration }
}
