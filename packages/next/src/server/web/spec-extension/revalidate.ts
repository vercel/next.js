import {
  abortAndThrowOnSynchronousRequestDataAccess,
  postponeWithTracking,
} from '../../app-render/dynamic-rendering'
import { isDynamicRoute } from '../../../shared/lib/router/utils'
import {
  NEXT_CACHE_IMPLICIT_TAG_ID,
  NEXT_CACHE_SOFT_TAG_MAX_LENGTH,
} from '../../../lib/constants'
import { workAsyncStorage } from '../../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../../app-render/work-unit-async-storage.external'
import { DynamicServerError } from '../../../client/components/hooks-server-context'

/**
 * This function allows you to purge [cached data](https://nextjs.org/docs/app/building-your-application/caching) on-demand for a specific cache tag.
 *
 * Read more: [Next.js Docs: `revalidateTag`](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)
 */
export function revalidateTag(tag: string) {
  return revalidate([tag], `revalidateTag ${tag}`)
}

/**
 * This function allows you to purge [cached data](https://nextjs.org/docs/app/building-your-application/caching) on-demand for a specific path.
 *
 * Read more: [Next.js Docs: `unstable_expirePath`](https://nextjs.org/docs/app/api-reference/functions/unstable_expirePath)
 */
export function unstable_expirePath(
  originalPath: string,
  type?: 'layout' | 'page'
) {
  if (originalPath.length > NEXT_CACHE_SOFT_TAG_MAX_LENGTH) {
    console.warn(
      `Warning: expirePath received "${originalPath}" which exceeded max length of ${NEXT_CACHE_SOFT_TAG_MAX_LENGTH}. See more info here https://nextjs.org/docs/app/api-reference/functions/unstable_expirePath`
    )
    return
  }

  let normalizedPath = `${NEXT_CACHE_IMPLICIT_TAG_ID}${originalPath}`

  if (type) {
    normalizedPath += `${normalizedPath.endsWith('/') ? '' : '/'}${type}`
  } else if (isDynamicRoute(originalPath)) {
    console.warn(
      `Warning: a dynamic page path "${originalPath}" was passed to "expirePath", but the "type" parameter is missing. This has no effect by default, see more info here https://nextjs.org/docs/app/api-reference/functions/unstable_expirePath`
    )
  }
  return revalidate([normalizedPath], `unstable_expirePath ${originalPath}`)
}

/**
 * This function allows you to purge [cached data](https://nextjs.org/docs/app/building-your-application/caching) on-demand for a specific cache tag.
 *
 * Read more: [Next.js Docs: `unstable_expireTag`](https://nextjs.org/docs/app/api-reference/functions/unstable_expireTag)
 */
export function unstable_expireTag(...tags: string[]) {
  return revalidate(tags, `unstable_expireTag ${tags.join(', ')}`)
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

  if (type) {
    normalizedPath += `${normalizedPath.endsWith('/') ? '' : '/'}${type}`
  } else if (isDynamicRoute(originalPath)) {
    console.warn(
      `Warning: a dynamic page path "${originalPath}" was passed to "revalidatePath", but the "type" parameter is missing. This has no effect by default, see more info here https://nextjs.org/docs/app/api-reference/functions/revalidatePath`
    )
  }
  return revalidate([normalizedPath], `revalidatePath ${originalPath}`)
}

function revalidate(tags: string[], expression: string) {
  const store = workAsyncStorage.getStore()
  if (!store || !store.incrementalCache) {
    throw new Error(
      `Invariant: static generation store missing in ${expression}`
    )
  }

  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    if (workUnitStore.type === 'cache') {
      throw new Error(
        `Route ${store.route} used "${expression}" inside a "use cache" which is unsupported. To ensure revalidation is performed consistently it must always happen outside of renders and cached functions. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    } else if (workUnitStore.type === 'unstable-cache') {
      throw new Error(
        `Route ${store.route} used "${expression}" inside a function cached with "unstable_cache(...)" which is unsupported. To ensure revalidation is performed consistently it must always happen outside of renders and cached functions. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    }
    if (workUnitStore.phase === 'render') {
      throw new Error(
        `Route ${store.route} used "${expression}" during render which is unsupported. To ensure revalidation is performed consistently it must always happen outside of renders and cached functions. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    }

    if (workUnitStore.type === 'prerender') {
      // dynamicIO Prerender
      const error = new Error(
        `Route ${store.route} used ${expression} without first calling \`await connection()\`.`
      )
      abortAndThrowOnSynchronousRequestDataAccess(
        store.route,
        expression,
        error,
        workUnitStore
      )
    } else if (workUnitStore.type === 'prerender-ppr') {
      // PPR Prerender
      postponeWithTracking(
        store.route,
        expression,
        workUnitStore.dynamicTracking
      )
    } else if (workUnitStore.type === 'prerender-legacy') {
      // legacy Prerender
      workUnitStore.revalidate = 0

      const err = new DynamicServerError(
        `Route ${store.route} couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`
      )
      store.dynamicUsageDescription = expression
      store.dynamicUsageStack = err.stack

      throw err
    } else if (
      process.env.NODE_ENV === 'development' &&
      workUnitStore &&
      workUnitStore.type === 'request'
    ) {
      workUnitStore.usedDynamic = true
    }
  }

  if (!store.revalidatedTags) {
    store.revalidatedTags = []
  }

  for (const tag of tags) {
    if (!store.revalidatedTags.includes(tag)) {
      store.revalidatedTags.push(tag)
    }
  }

  // TODO: only revalidate if the path matches
  store.pathWasRevalidated = true
}
