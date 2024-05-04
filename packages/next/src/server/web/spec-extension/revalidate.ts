import { trackDynamicDataAccessed } from '../../app-render/dynamic-rendering'
import { isDynamicRoute } from '../../../shared/lib/router/utils'
import {
  NEXT_CACHE_IMPLICIT_TAG_ID,
  NEXT_CACHE_SOFT_TAG_MAX_LENGTH,
} from '../../../lib/constants'
import { getPathname } from '../../../lib/url'
import { staticGenerationAsyncStorage } from '../../../client/components/static-generation-async-storage.external'

/**
 * This function allows you to purge [cached data](https://nextjs.org/docs/app/building-your-application/caching) on-demand for a specific cache tag.
 *
 * Read more: [Next.js Docs: `revalidateTag`](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)
 */
export function revalidateTag(tag: string) {
  return revalidate(tag, `revalidateTag ${tag}`)
}

/**
 * This function allows you to purge [cached data](https://nextjs.org/docs/app/building-your-application/caching) on-demand for a specific path.
 *
 * Read more: [Next.js Docs: `revalidatePath`](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)
 */
export function revalidatePath(originalPath: string, type?: 'layout' | 'page') {
  if (originalPath.length > NEXT_CACHE_SOFT_TAG_MAX_LENGTH) {
    console.warn(
      `Warning: revalidatePath received "${originalPath}" which exceeded max length of ${NEXT_CACHE_SOFT_TAG_MAX_LENGTH}. See more info here https://nextjs.org/docs/app/api-reference/functions/revalidatePath`
    )
    return
  }

  let normalizedPath = `${NEXT_CACHE_IMPLICIT_TAG_ID}${originalPath}`

  // A static route should not have a type, because a cache tag belonging to a dynamic
  // page won't ever be tagged with `/page` or `/layout` -- it'd just be the canonical URL.
  // We only append the type in the dynamic case, or for the root layout.
  if (isDynamicRoute(originalPath)) {
    if (type) {
      normalizedPath += `${normalizedPath.endsWith('/') ? '' : '/'}${type}`
    } else {
      console.warn(
        `Warning: a dynamic page path "${originalPath}" was passed to "revalidatePath", but the "type" parameter is missing. This has no effect by default, see more info here https://nextjs.org/docs/app/api-reference/functions/revalidatePath`
      )
    }
  } else if (normalizedPath === '/' && type === 'layout') {
    // the only time we want to append "type" is if it's a root layout revalidation,
    // as all cached fetches are tagged with `/layout`.
    normalizedPath = '/layout'
  }
  return revalidate(normalizedPath, `revalidatePath ${originalPath}`)
}

function revalidate(tag: string, expression: string) {
  const store = staticGenerationAsyncStorage.getStore()
  if (!store || !store.incrementalCache) {
    throw new Error(
      `Invariant: static generation store missing in ${expression}`
    )
  }

  if (store.isUnstableCacheCallback) {
    throw new Error(
      `Route ${getPathname(
        store.urlPathname
      )} used "${expression}" inside a function cached with "unstable_cache(...)" which is unsupported. To ensure revalidation is performed consistently it must always happen outside of renders and cached functions. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
    )
  }

  // a route that makes use of revalidation APIs should be considered dynamic
  // as otherwise it would be impossible to revalidate
  trackDynamicDataAccessed(store, expression)

  if (!store.revalidatedTags) {
    store.revalidatedTags = []
  }
  if (!store.revalidatedTags.includes(tag)) {
    store.revalidatedTags.push(tag)
  }

  // TODO: only revalidate if the path matches
  store.pathWasRevalidated = true
}
