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
import { InvariantError } from '../../../shared/lib/invariant-error'

type CacheLifeConfig = {
  expire?: number
}

/**
 * This function allows you to purge [cached data](https://nextjs.org/docs/app/building-your-application/caching) on-demand for a specific cache tag.
 *
 * Read more: [Next.js Docs: `revalidateTag`](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)
 */
export function revalidateTag(tag: string, profile: string | CacheLifeConfig) {
  if (!profile) {
    console.warn(
      '"revalidateTag" without the second argument is now deprecated, add second argument of "max" or use "updateTag". See more info here: https://nextjs.org/docs/messages/revalidate-tag-single-arg'
    )
  }
  return revalidate([tag], `revalidateTag ${tag}`, profile)
}

/**
 * This function allows you to update [cached data](https://nextjs.org/docs/app/building-your-application/caching) on-demand for a specific cache tag.
 * This can only be called from within a Server Action to enable read-your-own-writes semantics.
 *
 * Read more: [Next.js Docs: `updateTag`](https://nextjs.org/docs/app/api-reference/functions/updateTag)
 */
export function updateTag(tag: string) {
  const workStore = workAsyncStorage.getStore()

  // TODO: change this after investigating why phase: 'action' is
  // set for route handlers
  if (!workStore || workStore.page.endsWith('/route')) {
    throw new Error(
      'updateTag can only be called from within a Server Action. ' +
        'To invalidate cache tags in Route Handlers or other contexts, use revalidateTag instead. ' +
        'See more info here: https://nextjs.org/docs/app/api-reference/functions/updateTag'
    )
  }
  // updateTag uses immediate expiration (no profile) without deprecation warning
  return revalidate([tag], `updateTag ${tag}`, undefined)
}

/**
 * This function allows you to refresh client cache from server actions.
 * It's useful as dynamic data can be cached on the client which won't
 * be refreshed by expireTag
 */
export function refresh() {
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (
    !workStore ||
    workStore.page.endsWith('/route') ||
    workUnitStore?.phase !== 'action'
  ) {
    throw new Error(
      'refresh can only be called from within a Server Action. ' +
        'See more info here: https://nextjs.org/docs/app/api-reference/functions/refresh'
    )
  }

  if (workStore) {
    // TODO: break this to it's own field
    workStore.pathWasRevalidated = true
  }
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

  let normalizedPath = `${NEXT_CACHE_IMPLICIT_TAG_ID}${originalPath || '/'}`

  if (type) {
    normalizedPath += `${normalizedPath.endsWith('/') ? '' : '/'}${type}`
  } else if (isDynamicRoute(originalPath)) {
    console.warn(
      `Warning: a dynamic page path "${originalPath}" was passed to "revalidatePath", but the "type" parameter is missing. This has no effect by default, see more info here https://nextjs.org/docs/app/api-reference/functions/revalidatePath`
    )
  }

  const tags = [normalizedPath]
  if (normalizedPath === `${NEXT_CACHE_IMPLICIT_TAG_ID}/`) {
    tags.push(`${NEXT_CACHE_IMPLICIT_TAG_ID}/index`)
  } else if (normalizedPath === `${NEXT_CACHE_IMPLICIT_TAG_ID}/index`) {
    tags.push(`${NEXT_CACHE_IMPLICIT_TAG_ID}/`)
  }

  return revalidate(tags, `revalidatePath ${originalPath}`)
}

function revalidate(
  tags: string[],
  expression: string,
  profile?: string | CacheLifeConfig
) {
  const store = workAsyncStorage.getStore()
  if (!store || !store.incrementalCache) {
    throw new Error(
      `Invariant: static generation store missing in ${expression}`
    )
  }

  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    if (workUnitStore.phase === 'render') {
      throw new Error(
        `Route ${store.route} used "${expression}" during render which is unsupported. To ensure revalidation is performed consistently it must always happen outside of renders and cached functions. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    }

    switch (workUnitStore.type) {
      case 'cache':
      case 'private-cache':
        throw new Error(
          `Route ${store.route} used "${expression}" inside a "use cache" which is unsupported. To ensure revalidation is performed consistently it must always happen outside of renders and cached functions. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
        )
      case 'unstable-cache':
        throw new Error(
          `Route ${store.route} used "${expression}" inside a function cached with "unstable_cache(...)" which is unsupported. To ensure revalidation is performed consistently it must always happen outside of renders and cached functions. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
        )
      case 'prerender':
      case 'prerender-runtime':
        // cacheComponents Prerender
        const error = new Error(
          `Route ${store.route} used ${expression} without first calling \`await connection()\`.`
        )
        return abortAndThrowOnSynchronousRequestDataAccess(
          store.route,
          expression,
          error,
          workUnitStore
        )
      case 'prerender-client':
        throw new InvariantError(
          `${expression} must not be used within a client component. Next.js should be preventing ${expression} from being included in client components statically, but did not in this case.`
        )
      case 'prerender-ppr':
        return postponeWithTracking(
          store.route,
          expression,
          workUnitStore.dynamicTracking
        )
      case 'prerender-legacy':
        workUnitStore.revalidate = 0

        const err = new DynamicServerError(
          `Route ${store.route} couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`
        )
        store.dynamicUsageDescription = expression
        store.dynamicUsageStack = err.stack

        throw err
      case 'request':
        if (process.env.NODE_ENV !== 'production') {
          // TODO: This is most likely incorrect. It would lead to the ISR
          // status being flipped when revalidating a static page with a server
          // action.
          workUnitStore.usedDynamic = true
        }
        break
      default:
        workUnitStore satisfies never
    }
  }

  if (!store.pendingRevalidatedTags) {
    store.pendingRevalidatedTags = []
  }

  for (const tag of tags) {
    const existingIndex = store.pendingRevalidatedTags.findIndex((item) => {
      if (item.tag !== tag) return false
      // Compare profiles: both strings, both objects, or both undefined
      if (typeof item.profile === 'string' && typeof profile === 'string') {
        return item.profile === profile
      }
      if (typeof item.profile === 'object' && typeof profile === 'object') {
        return JSON.stringify(item.profile) === JSON.stringify(profile)
      }
      return item.profile === profile
    })
    if (existingIndex === -1) {
      store.pendingRevalidatedTags.push({
        tag,
        profile,
      })
    }
  }

  // if profile is provided and this is a stale-while-revalidate
  // update we do not mark the path as revalidated so that server
  // actions don't pull their own writes
  const cacheLife =
    profile && typeof profile === 'object'
      ? profile
      : profile &&
          typeof profile === 'string' &&
          store?.cacheLifeProfiles?.[profile]
        ? store.cacheLifeProfiles[profile]
        : undefined

  if (!profile || cacheLife?.expire === 0) {
    // TODO: only revalidate if the path matches
    store.pathWasRevalidated = true
  }
}
