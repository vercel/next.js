import type {
  ActionFlightResponse,
  ActionResult,
} from '../../../../server/app-render/types'
import { callServer } from '../../../app-call-server'
import { findSourceMapURL } from '../../../app-find-source-map-url'
import {
  ACTION_HEADER,
  NEXT_IS_PRERENDER_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_URL,
  RSC_CONTENT_TYPE_HEADER,
} from '../../app-router-headers'

// // eslint-disable-next-line import/no-extraneous-dependencies
// import { createFromFetch } from 'react-server-dom-webpack/client'
// // eslint-disable-next-line import/no-extraneous-dependencies
// import { encodeReply } from 'react-server-dom-webpack/client'
const { createFromFetch, createTemporaryReferenceSet, encodeReply } = (
  !!process.env.NEXT_RUNTIME
    ? // eslint-disable-next-line import/no-extraneous-dependencies
      require('react-server-dom-webpack/client.edge')
    : // eslint-disable-next-line import/no-extraneous-dependencies
      require('react-server-dom-webpack/client')
) as typeof import('react-server-dom-webpack/client')

import {
  PrefetchKind,
  type ReadonlyReducerState,
  type ReducerState,
  type ServerActionAction,
  type ServerActionMutable,
} from '../router-reducer-types'
import { assignLocation } from '../../../assign-location'
import { createHrefFromUrl } from '../create-href-from-url'
import { handleExternalUrl } from './navigate-reducer'
import { applyRouterStatePatchToTree } from '../apply-router-state-patch-to-tree'
import { isNavigatingToNewRootLayout } from '../is-navigating-to-new-root-layout'
import type { CacheNode } from '../../../../shared/lib/app-router-context.shared-runtime'
import { handleMutable } from '../handle-mutable'
import { fillLazyItemsTillLeafWithHead } from '../fill-lazy-items-till-leaf-with-head'
import { createEmptyCacheNode } from '../../app-router'
import { hasInterceptionRouteInCurrentTree } from './has-interception-route-in-current-tree'
import { handleSegmentMismatch } from '../handle-segment-mismatch'
import { refreshInactiveParallelSegments } from '../refetch-inactive-parallel-segments'
import {
  normalizeFlightData,
  type NormalizedFlightData,
} from '../../../flight-data-helpers'
import { getRedirectError } from '../../redirect'
import { RedirectType } from '../../redirect-error'
import { createSeededPrefetchCacheEntry } from '../prefetch-cache-utils'
import { removeBasePath } from '../../../remove-base-path'
import { hasBasePath } from '../../../has-base-path'
import {
  extractInfoFromServerReferenceId,
  omitUnusedArgs,
} from '../../../../shared/lib/server-reference-info'
import { revalidateEntireCache } from '../../segment-cache/cache'

type FetchServerActionResult = {
  redirectLocation: URL | undefined
  redirectType: RedirectType | undefined
  actionResult?: ActionResult
  actionFlightData?: NormalizedFlightData[] | string
  isPrerender: boolean
  revalidatedParts: {
    tag: boolean
    cookie: boolean
    paths: string[]
  }
}

async function fetchServerAction(
  state: ReadonlyReducerState,
  nextUrl: ReadonlyReducerState['nextUrl'],
  { actionId, actionArgs }: ServerActionAction
): Promise<FetchServerActionResult> {
  const temporaryReferences = createTemporaryReferenceSet()
  const info = extractInfoFromServerReferenceId(actionId)

  // TODO: Currently, we're only omitting unused args for the experimental "use
  // cache" functions. Once the server reference info byte feature is stable, we
  // should apply this to server actions as well.
  const usedArgs =
    info.type === 'use-cache' ? omitUnusedArgs(actionArgs, info) : actionArgs

  const body = await encodeReply(usedArgs, { temporaryReferences })

  const res = await fetch('', {
    method: 'POST',
    headers: {
      Accept: RSC_CONTENT_TYPE_HEADER,
      [ACTION_HEADER]: actionId,
      [NEXT_ROUTER_STATE_TREE_HEADER]: encodeURIComponent(
        JSON.stringify(state.tree)
      ),
      ...(process.env.NEXT_DEPLOYMENT_ID
        ? {
            'x-deployment-id': process.env.NEXT_DEPLOYMENT_ID,
          }
        : {}),
      ...(nextUrl
        ? {
            [NEXT_URL]: nextUrl,
          }
        : {}),
    },
    body,
  })

  const redirectHeader = res.headers.get('x-action-redirect')
  const [location, _redirectType] = redirectHeader?.split(';') || []
  let redirectType: RedirectType | undefined
  switch (_redirectType) {
    case 'push':
      redirectType = RedirectType.push
      break
    case 'replace':
      redirectType = RedirectType.replace
      break
    default:
      redirectType = undefined
  }

  const isPrerender = !!res.headers.get(NEXT_IS_PRERENDER_HEADER)
  let revalidatedParts: FetchServerActionResult['revalidatedParts']
  try {
    const revalidatedHeader = JSON.parse(
      res.headers.get('x-action-revalidated') || '[[],0,0]'
    )
    revalidatedParts = {
      paths: revalidatedHeader[0] || [],
      tag: !!revalidatedHeader[1],
      cookie: revalidatedHeader[2],
    }
  } catch (e) {
    revalidatedParts = {
      paths: [],
      tag: false,
      cookie: false,
    }
  }

  const redirectLocation = location
    ? assignLocation(
        location,
        new URL(state.canonicalUrl, window.location.href)
      )
    : undefined

  const contentType = res.headers.get('content-type')

  if (contentType?.startsWith(RSC_CONTENT_TYPE_HEADER)) {
    const response: ActionFlightResponse = await createFromFetch(
      Promise.resolve(res),
      { callServer, findSourceMapURL, temporaryReferences }
    )

    if (location) {
      // if it was a redirection, then result is just a regular RSC payload
      return {
        actionFlightData: normalizeFlightData(response.f),
        redirectLocation,
        redirectType,
        revalidatedParts,
        isPrerender,
      }
    }

    return {
      actionResult: response.a,
      actionFlightData: normalizeFlightData(response.f),
      redirectLocation,
      redirectType,
      revalidatedParts,
      isPrerender,
    }
  }

  // Handle invalid server action responses
  if (res.status >= 400) {
    // The server can respond with a text/plain error message, but we'll fallback to something generic
    // if there isn't one.
    const error =
      contentType === 'text/plain'
        ? await res.text()
        : 'An unexpected response was received from the server.'

    throw new Error(error)
  }

  return {
    redirectLocation,
    redirectType,
    revalidatedParts,
    isPrerender,
  }
}

/*
 * This reducer is responsible for calling the server action and processing any side-effects from the server action.
 * It does not mutate the state by itself but rather delegates to other reducers to do the actual mutation.
 */
export function serverActionReducer(
  state: ReadonlyReducerState,
  action: ServerActionAction
): ReducerState {
  const { resolve, reject } = action
  const mutable: ServerActionMutable = {}

  let currentTree = state.tree

  mutable.preserveCustomHistoryState = false

  // only pass along the `nextUrl` param (used for interception routes) if the current route was intercepted.
  // If the route has been intercepted, the action should be as well.
  // Otherwise the server action might be intercepted with the wrong action id
  // (ie, one that corresponds with the intercepted route)
  const nextUrl =
    state.nextUrl && hasInterceptionRouteInCurrentTree(state.tree)
      ? state.nextUrl
      : null

  return fetchServerAction(state, nextUrl, action).then(
    async ({
      actionResult,
      actionFlightData: flightData,
      redirectLocation,
      redirectType,
      isPrerender,
      revalidatedParts,
    }) => {
      let redirectHref: string | undefined

      // honor the redirect type instead of defaulting to push in case of server actions.
      if (redirectLocation) {
        if (redirectType === RedirectType.replace) {
          state.pushRef.pendingPush = false
          mutable.pendingPush = false
        } else {
          state.pushRef.pendingPush = true
          mutable.pendingPush = true
        }

        redirectHref = createHrefFromUrl(redirectLocation, false)
        mutable.canonicalUrl = redirectHref
      }

      if (!flightData) {
        resolve(actionResult)

        // If there is a redirect but no flight data we need to do a mpaNavigation.
        if (redirectLocation) {
          return handleExternalUrl(
            state,
            mutable,
            redirectLocation.href,
            state.pushRef.pendingPush
          )
        }
        return state
      }

      if (typeof flightData === 'string') {
        // Handle case when navigating to page in `pages` from `app`
        resolve(actionResult)

        return handleExternalUrl(
          state,
          mutable,
          flightData,
          state.pushRef.pendingPush
        )
      }

      const actionRevalidated =
        revalidatedParts.paths.length > 0 ||
        revalidatedParts.tag ||
        revalidatedParts.cookie

      for (const normalizedFlightData of flightData) {
        const {
          tree: treePatch,
          seedData: cacheNodeSeedData,
          head,
          isRootRender,
        } = normalizedFlightData

        if (!isRootRender) {
          // TODO-APP: handle this case better
          console.log('SERVER ACTION APPLY FAILED')
          resolve(actionResult)

          return state
        }

        // Given the path can only have two items the items are only the router state and rsc for the root.
        const newTree = applyRouterStatePatchToTree(
          // TODO-APP: remove ''
          [''],
          currentTree,
          treePatch,
          redirectHref ? redirectHref : state.canonicalUrl
        )

        if (newTree === null) {
          resolve(actionResult)

          return handleSegmentMismatch(state, action, treePatch)
        }

        if (isNavigatingToNewRootLayout(currentTree, newTree)) {
          resolve(actionResult)

          return handleExternalUrl(
            state,
            mutable,
            redirectHref || state.canonicalUrl,
            state.pushRef.pendingPush
          )
        }

        // The server sent back RSC data for the server action, so we need to apply it to the cache.
        if (cacheNodeSeedData !== null) {
          const rsc = cacheNodeSeedData[1]
          const cache: CacheNode = createEmptyCacheNode()
          cache.rsc = rsc
          cache.prefetchRsc = null
          cache.loading = cacheNodeSeedData[3]
          fillLazyItemsTillLeafWithHead(
            cache,
            // Existing cache is not passed in as server actions have to invalidate the entire cache.
            undefined,
            treePatch,
            cacheNodeSeedData,
            head,
            undefined
          )

          mutable.cache = cache
          if (process.env.__NEXT_CLIENT_SEGMENT_CACHE) {
            revalidateEntireCache()
          } else {
            mutable.prefetchCache = new Map()
          }
          if (actionRevalidated) {
            await refreshInactiveParallelSegments({
              state,
              updatedTree: newTree,
              updatedCache: cache,
              includeNextUrl: Boolean(nextUrl),
              canonicalUrl: mutable.canonicalUrl || state.canonicalUrl,
            })
          }
        }

        mutable.patchedTree = newTree
        currentTree = newTree
      }

      if (redirectLocation && redirectHref) {
        // Because the RedirectBoundary will trigger a navigation, we need to seed the prefetch cache
        // with the FlightData that we got from the server action for the target page, so that it's
        // available when the page is navigated to and doesn't need to be re-fetched.
        // We only do this if the server action didn't revalidate any data, as in that case the
        // client cache will be cleared and the data will be re-fetched anyway.
        if (!actionRevalidated) {
          createSeededPrefetchCacheEntry({
            url: redirectLocation,
            data: {
              flightData,
              canonicalUrl: undefined,
              couldBeIntercepted: false,
              prerendered: false,
              postponed: false,
              // TODO: We should be able to set this if the server action
              // returned a fully static response.
              staleTime: -1,
            },
            tree: state.tree,
            prefetchCache: state.prefetchCache,
            nextUrl: state.nextUrl,
            kind: isPrerender ? PrefetchKind.FULL : PrefetchKind.AUTO,
          })
          mutable.prefetchCache = state.prefetchCache
        }

        // If the action triggered a redirect, the action promise will be rejected with
        // a redirect so that it's handled by RedirectBoundary as we won't have a valid
        // action result to resolve the promise with. This will effectively reset the state of
        // the component that called the action as the error boundary will remount the tree.
        // The status code doesn't matter here as the action handler will have already sent
        // a response with the correct status code.
        reject(
          getRedirectError(
            hasBasePath(redirectHref)
              ? removeBasePath(redirectHref)
              : redirectHref,
            redirectType || RedirectType.push
          )
        )
      } else {
        resolve(actionResult)
      }

      return handleMutable(state, mutable)
    },
    (e: any) => {
      // When the server action is rejected we don't update the state and instead call the reject handler of the promise.
      reject(e)

      return state
    }
  )
}
