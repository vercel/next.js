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
} from '../router-reducer-types'
import { assignLocation } from '../../../assign-location'
import { createHrefFromUrl } from '../create-href-from-url'
import { hasInterceptionRouteInCurrentTree } from './has-interception-route-in-current-tree'
import {
  normalizeFlightData,
  prepareFlightRouterStateForRequest,
  type NormalizedFlightData,
} from '../../../flight-data-helpers'
import { getRedirectError } from '../../redirect'
import type { RedirectType } from '../../redirect-error'
import { removeBasePath } from '../../../remove-base-path'
import { hasBasePath } from '../../../has-base-path'
import {
  extractInfoFromServerReferenceId,
  omitUnusedArgs,
} from '../../../../shared/lib/server-reference-info'
import { invalidateEntirePrefetchCache } from '../../segment-cache/cache'
import { startRevalidationCooldown } from '../../segment-cache/scheduler'
import { getDeploymentId } from '../../../../shared/lib/deployment-id'
import {
  completeHardNavigation,
  convertServerPatchToFullTree,
  navigateToKnownRoute,
  navigate,
} from '../../segment-cache/navigation'
import { discoverKnownRoute } from '../../segment-cache/optimistic-routes'
import type { NormalizedSearch } from '../../segment-cache/cache-key'
import {
  ActionDidNotRevalidate,
  ActionDidRevalidateDynamicOnly,
  ActionDidRevalidateStaticAndDynamic,
  type ActionRevalidationKind,
} from '../../../../shared/lib/action-revalidation-kind'
import { isExternalURL } from '../../app-router-utils'
import { FreshnessPolicy } from '../ppr-navigations'
import { invalidateBfCache } from '../../segment-cache/bfcache'

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

// TODO: Refactor to be a discriminated union. Or just get rid of it;
// fetchServerAction only has one caller, no reason this intermediate type has
// to exist.
type FetchServerActionResult = {
  redirectLocation: URL | undefined
  redirectType: RedirectType | undefined
  revalidationKind: ActionRevalidationKind
  actionResult: ActionResult | undefined
  actionFlightData: NormalizedFlightData[] | string | undefined
  actionFlightDataRenderedSearch: NormalizedSearch | undefined
  isPrerender: boolean
  couldBeIntercepted: boolean
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

  const deploymentId = getDeploymentId()
  if (deploymentId) {
    headers['x-deployment-id'] = deploymentId
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
      redirectType = 'push'
      break
    case 'replace':
      redirectType = 'replace'
      break
    default:
      redirectType = undefined
  }

  const isPrerender = !!res.headers.get(NEXT_IS_PRERENDER_HEADER)

  let revalidationKind: ActionRevalidationKind = ActionDidNotRevalidate
  try {
    const revalidationHeader = res.headers.get('x-action-revalidated')
    if (revalidationHeader) {
      const parsedKind = JSON.parse(revalidationHeader)
      if (
        parsedKind === ActionDidRevalidateStaticAndDynamic ||
        parsedKind === ActionDidRevalidateDynamicOnly
      ) {
        revalidationKind = parsedKind
      }
    }
  } catch {}

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
  let actionFlightDataRenderedSearch: FetchServerActionResult['actionFlightDataRenderedSearch']
  let couldBeIntercepted: boolean = false

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
    couldBeIntercepted = response.i
    const maybeFlightData = normalizeFlightData(response.f)
    if (maybeFlightData !== '') {
      actionFlightData = maybeFlightData
      actionFlightDataRenderedSearch = response.q as NormalizedSearch
    }
  } else {
    // An external redirect doesn't contain RSC data.
    actionResult = undefined
    actionFlightData = undefined
    actionFlightDataRenderedSearch = undefined
  }

  return {
    actionResult,
    actionFlightData,
    actionFlightDataRenderedSearch,
    redirectLocation,
    redirectType,
    revalidationKind,
    isPrerender,
    couldBeIntercepted,
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

  return fetchServerAction(state, nextUrl, action).then(
    async ({
      revalidationKind,
      actionResult,
      actionFlightData: flightData,
      actionFlightDataRenderedSearch: flightDataRenderedSearch,
      redirectLocation,
      redirectType,
      isPrerender,
      couldBeIntercepted,
    }) => {
      if (revalidationKind !== ActionDidNotRevalidate) {
        // There was either a revalidation or a refresh, or maybe both.

        // Evict the BFCache, which may contain dynamic data.
        invalidateBfCache()

        // Store whether this action triggered any revalidation
        // The action queue will use this information to potentially
        // trigger a refresh action if the action was discarded
        // (ie, due to a navigation, before the action completed)
        action.didRevalidate = true

        // If there was a revalidation, evict the prefetch cache.
        // TODO: Evict only segments with matching tags and/or paths.
        // TODO: We should only invalidate the route cache if cookies were
        // mutated, since route trees may vary based on cookies. For now we
        // invalidate both caches until we have a way to detect cookie
        // mutations on the client.
        if (revalidationKind === ActionDidRevalidateStaticAndDynamic) {
          invalidateEntirePrefetchCache(nextUrl, state.tree)
        }

        // Start a cooldown before re-prefetching to allow CDN cache
        // propagation.
        startRevalidationCooldown()
      }

      const navigateType = redirectType || 'push'

      if (redirectLocation !== undefined) {
        // If the action triggered a redirect, the action promise will be rejected with
        // a redirect so that it's handled by RedirectBoundary as we won't have a valid
        // action result to resolve the promise with. This will effectively reset the state of
        // the component that called the action as the error boundary will remount the tree.
        // The status code doesn't matter here as the action handler will have already sent
        // a response with the correct status code.

        if (isExternalURL(redirectLocation)) {
          // External redirect. Triggers an MPA navigation.
          const redirectHref = redirectLocation.href
          const redirectError = createRedirectErrorForAction(
            redirectHref,
            navigateType
          )
          reject(redirectError)
          return completeHardNavigation(state, redirectLocation, navigateType)
        } else {
          // Internal redirect. Triggers an SPA navigation.
          const redirectWithBasepath = createHrefFromUrl(
            redirectLocation,
            false
          )
          const redirectHref = hasBasePath(redirectWithBasepath)
            ? removeBasePath(redirectWithBasepath)
            : redirectWithBasepath
          const redirectError = createRedirectErrorForAction(
            redirectHref,
            navigateType
          )
          reject(redirectError)
        }
      } else {
        // If there's no redirect, resolve the action with the result.
        resolve(actionResult)
      }

      // Check if we can bail out without updating any state.
      if (
        // Did the action trigger a redirect?
        redirectLocation === undefined &&
        // Did the action revalidate any data?
        revalidationKind === ActionDidNotRevalidate &&
        // Did the server render new data?
        flightData === undefined
      ) {
        // The action did not trigger any revalidations or redirects. No
        // navigation is required.
        return state
      }

      if (flightData === undefined && redirectLocation !== undefined) {
        // The server redirected, but did not send any Flight data. This implies
        // an external redirect.
        // TODO: We should refactor the action response type to be more explicit
        // about the various response types.
        return completeHardNavigation(state, redirectLocation, navigateType)
      }

      if (typeof flightData === 'string') {
        // If the flight data is just a string, something earlier in the
        // response handling triggered an external redirect.
        return completeHardNavigation(
          state,
          new URL(flightData, location.origin),
          navigateType
        )
      }

      // The action triggered a navigation — either a redirect, a revalidation,
      // or both.

      // If there was no redirect, then the target URL is the same as the
      // current URL.
      const currentUrl = new URL(state.canonicalUrl, location.origin)
      const currentRenderedSearch = state.renderedSearch
      const redirectUrl =
        redirectLocation !== undefined ? redirectLocation : currentUrl
      const currentFlightRouterState = state.tree
      const shouldScroll = true

      // If the action triggered a revalidation of the cache, we should also
      // refresh all the dynamic data.
      const freshnessPolicy =
        revalidationKind === ActionDidNotRevalidate
          ? FreshnessPolicy.Default
          : FreshnessPolicy.RefreshAll

      // The server may have sent back new data. If so, we will perform a
      // "seeded" navigation that uses the data from the response.
      // TODO: Currently the server always renders from the root in
      // response to a Server Action. In the case of a normal redirect
      // with no revalidation, it should skip over the shared layouts.
      if (flightData !== undefined && flightDataRenderedSearch !== undefined) {
        // The server sent back new route data as part of the response. We
        // will use this to render the new page. If this happens to be only a
        // subset of the data needed to render the new page, we'll initiate a
        // new fetch, like we would for a normal navigation.
        const redirectCanonicalUrl = createHrefFromUrl(redirectUrl)
        const redirectSeed = convertServerPatchToFullTree(
          currentFlightRouterState,
          flightData,
          flightDataRenderedSearch
        )
        const now = Date.now()

        // Learn the route pattern so we can predict it for future navigations.
        const metadataVaryPath = redirectSeed.metadataVaryPath
        if (metadataVaryPath !== null) {
          discoverKnownRoute(
            now,
            redirectUrl.pathname,
            null, // No pending entry
            redirectSeed.routeTree,
            metadataVaryPath,
            couldBeIntercepted,
            redirectCanonicalUrl,
            isPrerender,
            false // hasDynamicRewrite
          )
        }

        return navigateToKnownRoute(
          now,
          state,
          redirectUrl,
          redirectCanonicalUrl,
          redirectSeed,
          currentUrl,
          currentRenderedSearch,
          state.cache,
          currentFlightRouterState,
          freshnessPolicy,
          nextUrl,
          shouldScroll,
          navigateType,
          null,
          // Server action redirects don't use route prediction - we already
          // have the route tree from the server response. If a mismatch occurs
          // during dynamic data fetch, the retry handler will traverse the
          // known route tree to mark the entry as having a dynamic rewrite.
          null
        )
      }

      // The server did not send back new data. We'll perform a regular, non-
      // seeded navigation — effectively the same as <Link> or router.push().
      return navigate(
        state,
        redirectUrl,
        currentUrl,
        currentRenderedSearch,
        state.cache,
        currentFlightRouterState,
        nextUrl,
        freshnessPolicy,
        shouldScroll,
        navigateType
      )
    },
    (e: any) => {
      // When the server action is rejected we don't update the state and instead call the reject handler of the promise.
      reject(e)

      return state
    }
  )
}

function createRedirectErrorForAction(
  redirectHref: string,
  resolvedRedirectType: RedirectType
) {
  const redirectError = getRedirectError(redirectHref, resolvedRedirectType)
  // We mark the error as handled because we don't want the redirect to be tried later by
  // the RedirectBoundary, in case the user goes back and `Activity` triggers the redirect
  // again, as it's run within an effect.
  // We don't actually need the RedirectBoundary to do a router.push because we already
  // have all the necessary RSC data to render the new page within a single roundtrip.
  ;(redirectError as any).handled = true
  return redirectError
}
