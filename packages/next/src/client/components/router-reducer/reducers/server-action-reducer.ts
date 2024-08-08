import type {
  ActionFlightResponse,
  ActionResult,
  FlightData,
} from '../../../../server/app-render/types'
import { callServer } from '../../../app-call-server'
import {
  ACTION_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_URL,
  RSC_CONTENT_TYPE_HEADER,
} from '../../app-router-headers'
// // eslint-disable-next-line import/no-extraneous-dependencies
// import { createFromFetch } from 'react-server-dom-webpack/client'
// // eslint-disable-next-line import/no-extraneous-dependencies
// import { encodeReply } from 'react-server-dom-webpack/client'
const { createFromFetch, encodeReply } = (
  !!process.env.NEXT_RUNTIME
    ? // eslint-disable-next-line import/no-extraneous-dependencies
      require('react-server-dom-webpack/client.edge')
    : // eslint-disable-next-line import/no-extraneous-dependencies
      require('react-server-dom-webpack/client')
) as typeof import('react-server-dom-webpack/client')

import type {
  ReadonlyReducerState,
  ReducerState,
  ServerActionAction,
  ServerActionMutable,
} from '../router-reducer-types'
import { addBasePath } from '../../../add-base-path'
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

type FetchServerActionResult = {
  redirectLocation: URL | undefined
  actionResult?: ActionResult
  actionFlightData?: FlightData | undefined | null
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
  const body = await encodeReply(actionArgs)

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

  const location = res.headers.get('x-action-redirect')
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
    ? new URL(
        addBasePath(location),
        // Ensure relative redirects in Server Actions work, e.g. redirect('./somewhere-else')
        new URL(state.canonicalUrl, window.location.href)
      )
    : undefined

  const contentType = res.headers.get('content-type')

  if (contentType === RSC_CONTENT_TYPE_HEADER) {
    const response: ActionFlightResponse = await createFromFetch(
      Promise.resolve(res),
      {
        callServer,
      }
    )

    if (location) {
      // if it was a redirection, then result is just a regular RSC payload
      return {
        actionFlightData: response.f,
        redirectLocation,
        revalidatedParts,
      }
    }

    return {
      actionResult: response.a,
      actionFlightData: response.f,
      redirectLocation,
      revalidatedParts,
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
    revalidatedParts,
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
  const href = state.canonicalUrl

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
    }) => {
      // Make sure the redirection is a push instead of a replace.
      // Issue: https://github.com/vercel/next.js/issues/53911
      if (redirectLocation) {
        state.pushRef.pendingPush = true
        mutable.pendingPush = true
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
        return handleExternalUrl(
          state,
          mutable,
          flightData,
          state.pushRef.pendingPush
        )
      }

      if (redirectLocation) {
        const newHref = createHrefFromUrl(redirectLocation, false)
        mutable.canonicalUrl = newHref
      }

      for (const flightDataPath of flightData) {
        // FlightDataPath with more than two items means unexpected Flight data was returned
        if (flightDataPath.length !== 3) {
          // TODO-APP: handle this case better
          console.log('SERVER ACTION APPLY FAILED')
          return state
        }

        // Given the path can only have two items the items are only the router state and rsc for the root.
        const [treePatch] = flightDataPath
        const newTree = applyRouterStatePatchToTree(
          // TODO-APP: remove ''
          [''],
          currentTree,
          treePatch,
          redirectLocation
            ? createHrefFromUrl(redirectLocation)
            : state.canonicalUrl
        )

        if (newTree === null) {
          return handleSegmentMismatch(state, action, treePatch)
        }

        if (isNavigatingToNewRootLayout(currentTree, newTree)) {
          return handleExternalUrl(
            state,
            mutable,
            href,
            state.pushRef.pendingPush
          )
        }

        // The one before last item is the router state tree patch
        const [cacheNodeSeedData, head] = flightDataPath.slice(-2)
        const rsc = cacheNodeSeedData !== null ? cacheNodeSeedData[2] : null

        // Handles case where prefetch only returns the router tree patch without rendered components.
        if (rsc !== null) {
          const cache: CacheNode = createEmptyCacheNode()
          cache.rsc = rsc
          cache.prefetchRsc = null
          cache.loading = cacheNodeSeedData[3]
          fillLazyItemsTillLeafWithHead(
            cache,
            // Existing cache is not passed in as `router.refresh()` has to invalidate the entire cache.
            undefined,
            treePatch,
            cacheNodeSeedData,
            head
          )

          await refreshInactiveParallelSegments({
            state,
            updatedTree: newTree,
            updatedCache: cache,
            includeNextUrl: Boolean(nextUrl),
            canonicalUrl: mutable.canonicalUrl || state.canonicalUrl,
          })

          mutable.cache = cache
          mutable.prefetchCache = new Map()
        }

        mutable.patchedTree = newTree
        currentTree = newTree
      }

      resolve(actionResult)

      return handleMutable(state, mutable)
    },
    (e: any) => {
      // When the server action is rejected we don't update the state and instead call the reject handler of the promise.
      reject(e)

      return state
    }
  )
}
