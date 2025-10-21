import type {
  ActionFlightResponse,
  ActionResult,
} from '../../../../shared/lib/app-router-types'
import { callServer } from '../../../app-call-server'
import { findSourceMapURL } from '../../../app-find-source-map-url'
import {
  ACTION_HEADER,
  NEXT_ACTION_NOT_FOUND_HEADER,
  NEXT_IS_PRERENDER_HEADER,
  NEXT_HTML_REQUEST_ID_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_URL,
  RSC_CONTENT_TYPE_HEADER,
  NEXT_REQUEST_ID_HEADER,
} from '../../app-router-headers'
import { UnrecognizedActionError } from '../../unrecognized-action-error'

// TODO: Explicitly import from client.browser
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  createFromFetch as createFromFetchBrowser,
  createTemporaryReferenceSet,
  encodeReply,
} from 'react-server-dom-webpack/client'

import type {
  ReadonlyReducerState,
  ReducerState,
  ServerActionAction,
  ServerActionMutable,
} from '../router-reducer-types'
import { assignLocation } from '../../../assign-location'
import { createHrefFromUrl } from '../create-href-from-url'
import { handleExternalUrl } from './navigate-reducer'
import { applyRouterStatePatchToTree } from '../apply-router-state-patch-to-tree'
import { isNavigatingToNewRootLayout } from '../is-navigating-to-new-root-layout'
import type { CacheNode } from '../../../../shared/lib/app-router-types'
import { handleMutable } from '../handle-mutable'
import { fillLazyItemsTillLeafWithHead } from '../fill-lazy-items-till-leaf-with-head'
import { createEmptyCacheNode } from '../../app-router'
import { hasInterceptionRouteInCurrentTree } from './has-interception-route-in-current-tree'
import { handleSegmentMismatch } from '../handle-segment-mismatch'
import { refreshInactiveParallelSegments } from '../refetch-inactive-parallel-segments'
import {
  normalizeFlightData,
  prepareFlightRouterStateForRequest,
  type NormalizedFlightData,
} from '../../../flight-data-helpers'
import { getRedirectError } from '../../redirect'
import { RedirectType } from '../../redirect-error'
import { removeBasePath } from '../../../remove-base-path'
import { hasBasePath } from '../../../has-base-path'
import {
  extractInfoFromServerReferenceId,
  omitUnusedArgs,
} from '../../../../shared/lib/server-reference-info'
import { revalidateEntireCache } from '../../segment-cache'

const createFromFetch =
  createFromFetchBrowser as (typeof import('react-server-dom-webpack/client.browser'))['createFromFetch']

let createDebugChannel:
  | typeof import('../../../dev/debug-channel').createDebugChannel
  | undefined

if (
  process.env.NODE_ENV !== 'production' &&
  process.env.__NEXT_REACT_DEBUG_CHANNEL
) {
  createDebugChannel = (
    require('../../../dev/debug-channel') as typeof import('../../../dev/debug-channel')
  ).createDebugChannel
}

type FetchServerActionResult = {
  redirectLocation: URL | undefined
  redirectType: RedirectType | undefined
  actionResult: ActionResult | undefined
  actionFlightData: NormalizedFlightData[] | string | undefined
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

  const headers: Record<string, string> = {
    Accept: RSC_CONTENT_TYPE_HEADER,
    [ACTION_HEADER]: actionId,
    [NEXT_ROUTER_STATE_TREE_HEADER]: prepareFlightRouterStateForRequest(
      state.tree
    ),
  }

  if (process.env.NEXT_DEPLOYMENT_ID) {
    headers['x-deployment-id'] = process.env.NEXT_DEPLOYMENT_ID
  }

  if (nextUrl) {
    headers[NEXT_URL] = nextUrl
  }

  if (process.env.NODE_ENV !== 'production') {
    if (self.__next_r) {
      headers[NEXT_HTML_REQUEST_ID_HEADER] = self.__next_r
    }

    // Create a new request ID for the server action request. The server uses
    // this to tag debug information sent via WebSocket to the client, which
    // then routes those chunks to the debug channel associated with this ID.
    headers[NEXT_REQUEST_ID_HEADER] = crypto
      .getRandomValues(new Uint32Array(1))[0]
      .toString(16)
  }

  const res = await fetch(state.canonicalUrl, { method: 'POST', headers, body })

  // Handle server actions that the server didn't recognize.
  const unrecognizedActionHeader = res.headers.get(NEXT_ACTION_NOT_FOUND_HEADER)
  if (unrecognizedActionHeader === '1') {
    throw new UnrecognizedActionError(
      `Server Action "${actionId}" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action`
    )
  }

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
    revalidatedParts = NO_REVALIDATED_PARTS
  }

  const redirectLocation = location
    ? assignLocation(
        location,
        new URL(state.canonicalUrl, window.location.href)
      )
    : undefined

  const contentType = res.headers.get('content-type')
  const isRscResponse = !!(
    contentType && contentType.startsWith(RSC_CONTENT_TYPE_HEADER)
  )

  // Handle invalid server action responses.
  // A valid response must have `content-type: text/x-component`, unless it's an external redirect.
  // (external redirects have an 'x-action-redirect' header, but the body is an empty 'text/plain')
  if (!isRscResponse && !redirectLocation) {
    // The server can respond with a text/plain error message, but we'll fallback to something generic
    // if there isn't one.
    const message =
      res.status >= 400 && contentType === 'text/plain'
        ? await res.text()
        : 'An unexpected response was received from the server.'

    throw new Error(message)
  }

  let actionResult: FetchServerActionResult['actionResult']
  let actionFlightData: FetchServerActionResult['actionFlightData']

  if (isRscResponse) {
    const response: ActionFlightResponse = await createFromFetch(
      Promise.resolve(res),
      {
        callServer,
        findSourceMapURL,
        temporaryReferences,
        debugChannel: createDebugChannel && createDebugChannel(headers),
      }
    )

    // An internal redirect can send an RSC response, but does not have a useful `actionResult`.
    actionResult = redirectLocation ? undefined : response.a
    actionFlightData = normalizeFlightData(response.f)
  } else {
    // An external redirect doesn't contain RSC data.
    actionResult = undefined
    actionFlightData = undefined
  }

  return {
    actionResult,
    actionFlightData,
    redirectLocation,
    redirectType,
    revalidatedParts,
    isPrerender,
  }
}

const NO_REVALIDATED_PARTS = {
  paths: [],
  tag: false,
  cookie: false,
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
    // We always send the last next-url, not the current when
    // performing a dynamic request. This is because we update
    // the next-url after a navigation, but we want the same
    // interception route to be matched that used the last
    // next-url.
    (state.previousNextUrl || state.nextUrl) &&
    hasInterceptionRouteInCurrentTree(state.tree)
      ? state.previousNextUrl || state.nextUrl
      : null

  const navigatedAt = Date.now()

  return fetchServerAction(state, nextUrl, action).then(
    async ({
      actionResult,
      actionFlightData: flightData,
      redirectLocation,
      redirectType,
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

      // Store whether this action triggered any revalidation
      // The action queue will use this information to potentially
      // trigger a refresh action if the action was discarded
      // (ie, due to a navigation, before the action completed)
      if (actionRevalidated) {
        action.didRevalidate = true
      }

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
          const rsc = cacheNodeSeedData[0]
          const cache: CacheNode = createEmptyCacheNode()
          cache.rsc = rsc
          cache.prefetchRsc = null
          cache.loading = cacheNodeSeedData[2]
          fillLazyItemsTillLeafWithHead(
            navigatedAt,
            cache,
            // Existing cache is not passed in as server actions have to invalidate the entire cache.
            undefined,
            treePatch,
            cacheNodeSeedData,
            head
          )

          mutable.cache = cache
          revalidateEntireCache(state.nextUrl, newTree)
          if (actionRevalidated) {
            await refreshInactiveParallelSegments({
              navigatedAt,
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

        // TODO: Investigate why this is needed with Activity.
        if (process.env.__NEXT_CACHE_COMPONENTS) {
          return state
        }
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
