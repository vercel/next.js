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
import { fetch } from '../../segment-cache/fetch'

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
import { ACTION_SERVER_ACTION, ScrollBehavior } from '../router-reducer-types'
import { dispatchAppRouterAction } from '../../use-action-queue'
import { getCurrentAppRouterState } from '../../app-router-instance'
import { startTransition } from 'react'
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
import { getNavigationBuildId } from '../../../navigation-build-id'
import { NEXT_NAV_DEPLOYMENT_ID_HEADER } from '../../../../lib/constants'
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
import { processFetch } from '../fetch-server-response'
import {
  invalidateBfCache,
  UnknownDynamicStaleTime,
} from '../../segment-cache/bfcache'

const createFromFetch =
  createFromFetchBrowser as (typeof import('react-server-dom-webpack/client.browser'))['createFromFetch']

let createDebugChannel:
  | typeof import('../../../dev/debug-channel').createDebugChannel
  | undefined

if (process.env.__NEXT_DEV_SERVER && process.env.__NEXT_REACT_DEBUG_CHANNEL) {
  createDebugChannel = (
    require('../../../dev/debug-channel') as typeof import('../../../dev/debug-channel')
  ).createDebugChannel
}

// TODO: Refactor to be a discriminated union.
export type FetchServerActionResult = {
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
  actionId: string,
  actionArgs: any[]
): Promise<FetchServerActionResult> {
  const temporaryReferences = createTemporaryReferenceSet()
  const info = extractInfoFromServerReferenceId(actionId)
  const usedArgs = omitUnusedArgs(actionArgs, info)
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

  if (process.env.__NEXT_DEV_SERVER) {
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

  let res: Response
  try {
    res = await fetch(state.canonicalUrl, { method: 'POST', headers, body })
    // If the fetch succeeds while we're in the offline state, notify the
    // offline module so it can short-circuit the polling loop.
    if (process.env.__NEXT_USE_OFFLINE) {
      const { notifyOnline } =
        require('../../offline') as typeof import('../../offline')
      notifyOnline()
    }
  } catch (err) {
    if (process.env.__NEXT_USE_OFFLINE) {
      const { checkOfflineError, getOffline, waitForConnection } =
        require('../../offline') as typeof import('../../offline')
      if (checkOfflineError(err)) {
        // It's safe to replay the action because the fetch rejection
        // means the request never reached the server — there are no
        // side effects to duplicate.
        const offline = getOffline()
        if (offline !== null) {
          await waitForConnection(offline)
        }
        return fetchServerAction(state, nextUrl, actionId, actionArgs)
      }
    }
    throw err
  }

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
    // Server action redirect responses carry the Flight data of the redirect
    // target, which may be prerendered with a completeness marker byte
    // prepended. Strip it before passing to Flight.
    const responsePromise = redirectLocation
      ? processFetch(res).then(({ response: r }) => r)
      : Promise.resolve(res)

    const response: ActionFlightResponse = await createFromFetch(
      responsePromise,
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

    // Check if the response build ID matches the client build ID.
    // In a multi-zone setup, when a server action triggers a redirect,
    // the server pre-fetches the redirect target as RSC. If the redirect
    // target is served by a different Next.js zone (different build), the
    // pre-fetched RSC data will have a foreign build ID. We must discard
    // the flight data in that case so the redirect triggers an MPA
    // navigation (full page load) instead of trying to apply the foreign
    // RSC payload — which would result in a blank page.
    const responseBuildId =
      res.headers.get(NEXT_NAV_DEPLOYMENT_ID_HEADER) ?? response.b
    if (
      responseBuildId !== undefined &&
      responseBuildId !== getNavigationBuildId()
    ) {
      // Build ID mismatch — discard the flight data. The redirect will
      // still be processed, and the absence of flight data will cause an
      // MPA navigation via completeHardNavigation().
    } else {
      const maybeFlightData = normalizeFlightData(response.f)
      if (maybeFlightData !== '') {
        actionFlightData = maybeFlightData
        actionFlightDataRenderedSearch = response.q as NormalizedSearch
      }
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
  const nextUrl = getServerActionNextUrl(state)

  const applyResult = async (result: FetchServerActionResult) => {
    const {
      revalidationKind,
      actionResult,
      actionFlightData: flightData,
      actionFlightDataRenderedSearch: flightDataRenderedSearch,
      redirectLocation,
      redirectType,
      isPrerender,
      couldBeIntercepted,
    } = result
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

        // The legacy path triggers the MPA here. The parallel path could hit a
        // case where the external redirect is superseded by a navigation or refresh,
        // and the redirect should be dropped. Will refresh the current route instead.
        if (!process.env.__NEXT_EXPERIMENTAL_PARALLEL_SERVER_FUNCTIONS) {
          return completeHardNavigation(state, redirectLocation, navigateType)
        }
      } else {
        // Internal redirect. Triggers an SPA navigation.
        const redirectWithBasepath = createHrefFromUrl(redirectLocation, false)
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

    if (process.env.__NEXT_EXPERIMENTAL_PARALLEL_SERVER_FUNCTIONS) {
      // If the tree changed after this action's off-queue fetch, another commit
      // (a navigation, a refresh, or another Server Function) landed first, so
      // this result is a patch against a tree that no longer exists. Drop it the
      // way the legacy queue drops a superseded action. If the action also
      // revalidated, dropping its render leaves that data change unreflected, so
      // re-navigate the current route with RefreshAll to refetch and sync it.
      //
      // "Revalidated" is any change the server flags as needing a re-render
      // (revalidationKind !== ActionDidNotRevalidate): revalidatePath, updateTag,
      // or a cookie mutation (cookies can change what the route renders). A plain
      // redirect is not a revalidation, so a stale redirect is just dropped, with
      // no refetch.
      //
      // Concurrent revalidating commits each refetch here: the first commit
      // applies cleanly, the other N-1 are stale and refetch. Coalescing them
      // into a single refetch is a known follow-up.
      //
      // This is the "action ran, but the tree moved under it" case. The
      // complementary case, where a navigation discards this action while it is
      // still pending in the queue, is handled separately by the queue (it sets
      // `needsRefresh` from `action.didRevalidate`). The two never double-fire:
      // a discarded action's reducer result is thrown away, so only one refresh
      // runs.
      const treeChangedSinceFetch =
        action.expectedTree !== null && action.expectedTree !== state.tree
      if (treeChangedSinceFetch) {
        if (revalidationKind !== ActionDidNotRevalidate) {
          const refreshUrl = new URL(state.canonicalUrl, location.origin)
          return navigate(
            state,
            refreshUrl,
            refreshUrl,
            state.renderedSearch,
            state.cache,
            state.tree,
            nextUrl,
            FreshnessPolicy.RefreshAll,
            ScrollBehavior.Default,
            'push'
          )
        }
        return state
      }

      // Tree matches expected, handle external redirects here.
      if (redirectLocation !== undefined && isExternalURL(redirectLocation)) {
        return completeHardNavigation(state, redirectLocation, navigateType)
      }
    }

    // Check if we can bail out without updating any state.
    if (hasNothingToCommit(result)) {
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
    const scrollBehavior = ScrollBehavior.Default

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
      const now = Date.now()
      // TODO: Store the dynamic stale time on the top-level state so it's
      // known during restores and refreshes.
      const redirectSeed = convertServerPatchToFullTree(
        now,
        currentFlightRouterState,
        flightData,
        flightDataRenderedSearch,
        UnknownDynamicStaleTime
      )

      // Learn the route pattern so we can predict it for future navigations.
      const metadataVaryPath = redirectSeed.metadataVaryPath
      if (metadataVaryPath !== null) {
        discoverKnownRoute(
          now,
          redirectUrl.pathname,
          redirectUrl.search as NormalizedSearch,
          nextUrl,
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
        scrollBehavior,
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
      scrollBehavior,
      navigateType
    )
  }

  // Parallel path (experimental.parallelServerFunctions): `callServerParallel`
  // already fetched this call without dispatching it into the queue and passed
  // the result in as `fetchResult`. Skip the fetch and commit that result here,
  // in queue order. DCE'd when the flag is off, so the legacy path below is
  // untouched. (Results with nothing to commit never reach this reducer; they
  // were resolved without ever being dispatched to the queue.)
  if (process.env.__NEXT_EXPERIMENTAL_PARALLEL_SERVER_FUNCTIONS) {
    if (action.fetchResult !== null) {
      return applyResult(action.fetchResult)
    }
  }

  return fetchServerAction(
    state,
    nextUrl,
    action.actionId,
    action.actionArgs
  ).then(applyResult, (e: any) => {
    // When the server action is rejected we don't update the state and instead call the reject handler of the promise.
    reject(e)

    return state
  })
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

/**
 * Computes the `nextUrl` to send with a Server Function request. We only pass
 * along the `nextUrl` param (used for interception routes) if the current route
 * was intercepted. If the route has been intercepted, the action should be as
 * well. Otherwise the server action might be intercepted with the wrong action
 * id (ie, one that corresponds with the intercepted route).
 */
function getServerActionNextUrl(
  state: ReadonlyReducerState
): ReadonlyReducerState['nextUrl'] {
  return (
    // We always send the last next-url, not the current when
    // performing a dynamic request. This is because we update
    // the next-url after a navigation, but we want the same
    // interception route to be matched that used the last
    // next-url.
    (state.previousNextUrl || state.nextUrl) &&
      hasInterceptionRouteInCurrentTree(state.tree)
      ? state.previousNextUrl || state.nextUrl
      : null
  )
}

/**
 * Returns whether a Server Function result has nothing for the router to
 * commit: it did not redirect, revalidate, or return new flight data, so the
 * caller's value can resolve immediately, without dispatching into the action
 * queue. This reflects the client result, not server intent: a server-side
 * mutation that triggers none of these is indistinguishable from a read here.
 *
 * Single source of truth shared by `callServerParallel` (to resolve a value
 * without a commit) and `serverActionReducer` (to bail out without updating
 * state).
 */
function hasNothingToCommit(result: FetchServerActionResult): boolean {
  return (
    // no redirect,
    result.redirectLocation === undefined &&
    // no revalidation,
    result.revalidationKind === ActionDidNotRevalidate &&
    // and no new server-rendered data.
    result.actionFlightData === undefined
  )
}

/**
 * Parallel `callServer` path (experimental.parallelServerFunctions).
 *
 * The legacy path dispatches the call into the action queue and fetches it from
 * there, so calls run serially, and each waits for the previous round-trip. This
 * path issues the fetch without dispatching into the queue, so concurrent Server
 * Function calls overlap on the network, then routes the result based on whether
 * it must change router state.
 *
 * Ordering: the commit is dispatched when the fetch resolves, not when the call
 * is made, so commits run in completion order, not call order. The action queue
 * still serializes them (one at a time, never interleaved with each other or
 * with navigations), but concurrent calls have no guaranteed order relative to
 * one another. Code that needs ordered, sequential semantics should use
 * `useActionState`, which chains its dispatches at the hook level.
 */
export async function callServerParallel(actionId: string, actionArgs: any[]) {
  const state = getCurrentAppRouterState()
  if (state === null) {
    // Unreachable in practice: a Server Function can only be called from a
    // hydrated tree. Mirror `dispatchAppRouterAction`'s guard so the failure
    // mode matches the legacy path exactly.
    throw new Error(
      'Internal Next.js error: Router action dispatched before initialization.'
    )
  }

  // The generation this fetch is issued against. The commit compares it to the
  // live tree to detect a navigation that landed while the fetch was in flight,
  // which would make this result's flight data a patch against a stale tree.
  const expectedTree = state.tree

  // 1. Fetch without dispatching into the action queue. This is the whole point
  // of the parallel path: the request goes out now, not when the queue gets
  // around to it, so multiple in-flight Server Function calls overlap instead of
  // running one at a time.
  const nextUrl = getServerActionNextUrl(state)
  const result = await fetchServerAction(state, nextUrl, actionId, actionArgs)

  // 2. The result changes nothing in the router (no redirect, no revalidation,
  // no new flight data), so there is nothing to serialize. Return the value
  // directly and never enter the queue.
  if (hasNothingToCommit(result)) {
    return result.actionResult
  }

  // 3. Commit through the queue. Dispatch to the same queue the legacy path
  // uses, but carry the result we already fetched: the reducer sees it and
  // handles it directly instead of fetching again, so the queue replays only
  // the state mutation, not the network round-trip.
  return new Promise((resolve, reject) => {
    startTransition(() => {
      dispatchAppRouterAction({
        type: ACTION_SERVER_ACTION,
        // Required by the action shape but unused on this path: the reducer
        // commits `fetchResult` directly and never re-fetches, so it does not
        // read `actionId`/`actionArgs` here (only the legacy path does).
        actionId,
        actionArgs,
        resolve,
        reject,
        fetchResult: result,
        expectedTree,
      })
    })
  })
}
