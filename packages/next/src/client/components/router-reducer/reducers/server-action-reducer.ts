import type {
  ActionFlightResponse,
  ActionResult,
  FlightRouterState,
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

import {
  ACTION_NAVIGATE,
  type ReadonlyReducerState,
  type ReducerState,
  type ServerActionAction,
} from '../router-reducer-types'
import { assignLocation } from '../../../assign-location'
import { createHrefFromUrl } from '../create-href-from-url'
import { handleSuspendedNavigation } from './navigate-reducer'
import { hasInterceptionRouteInCurrentTree } from './has-interception-route-in-current-tree'
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
import { revalidateEntireCache } from '../../segment-cache/cache'
import { getDeploymentId } from '../../../../shared/lib/deployment-id'
import { convertServerPatchToFullTree } from '../../segment-cache/navigation'
import type { NormalizedSearch } from '../../segment-cache/cache-key'
import {
  ActionDidNotRevalidate,
  ActionDidRevalidateDynamicOnly,
  ActionDidRevalidateStaticAndDynamic,
  type ActionRevalidationKind,
} from '../../../../shared/lib/action-revalidation-kind'
import { DynamicRequestTreeForEntireRoute } from '../ppr-navigations'
import { dispatchAppRouterAction } from '../../use-action-queue'
import { getCurrentAppRouterState } from '../../app-router-instance'
import {
  type ServerActionTask,
  scheduleServerAction,
} from './server-action-scheduler'

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
export type FetchServerActionResult = {
  redirectLocation: URL | undefined
  redirectType: RedirectType | undefined
  revalidationKind: ActionRevalidationKind
  actionResult: ActionResult | undefined
  actionFlightData: NormalizedFlightData[] | string | undefined
  actionFlightDataRenderedSearch: NormalizedSearch | undefined
  actionFlightDataCouldBeIntercepted: boolean | undefined
  isPrerender: boolean
}

export async function fetchServerAction(
  task: ServerActionTask
): Promise<FetchServerActionResult> {
  // TODO: Move this function to server-action-scheduler.ts. Perhaps combine
  // with `scheduleServerAction`.
  const urlOfPageToInvokeActionOn = task.url
  const baseTree = task.baseTree
  const needsRefresh = task.needsRefresh
  const nextUrl = task.nextUrl
  const actionId = task.actionId
  const actionArgs = task.actionArgs

  const temporaryReferences = createTemporaryReferenceSet()
  const info = extractInfoFromServerReferenceId(actionId)

  // TODO: Currently, we're only omitting unused args for the experimental "use
  // cache" functions. Once the server reference info byte feature is stable, we
  // should apply this to server actions as well.
  const usedArgs =
    info.type === 'use-cache' ? omitUnusedArgs(actionArgs, info) : actionArgs

  const body = await encodeReply(usedArgs, { temporaryReferences })

  const dynamicRequestTree = needsRefresh
    ? baseTree
    : DynamicRequestTreeForEntireRoute

  const headers: Record<string, string> = {
    Accept: RSC_CONTENT_TYPE_HEADER,
    [ACTION_HEADER]: actionId,
    [NEXT_ROUTER_STATE_TREE_HEADER]:
      prepareFlightRouterStateForRequest(dynamicRequestTree),
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

  const res = await fetch(urlOfPageToInvokeActionOn, {
    method: 'POST',
    headers,
    body,
  })

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
    ? assignLocation(location, urlOfPageToInvokeActionOn)
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
  let actionFlightDataCouldBeIntercepted: FetchServerActionResult['actionFlightDataCouldBeIntercepted']

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
    const maybeFlightData = normalizeFlightData(response.f)
    if (maybeFlightData !== '') {
      actionFlightData = maybeFlightData
      actionFlightDataRenderedSearch = response.q as NormalizedSearch
      actionFlightDataCouldBeIntercepted = response.i
    }
  } else {
    // An external redirect doesn't contain RSC data.
    actionResult = undefined
    actionFlightData = undefined
    actionFlightDataRenderedSearch = undefined
    actionFlightDataCouldBeIntercepted = undefined
  }

  return {
    actionResult,
    actionFlightData,
    actionFlightDataRenderedSearch,
    actionFlightDataCouldBeIntercepted,
    redirectLocation,
    redirectType,
    revalidationKind,
    isPrerender,
  }
}

export function serverActionReducer(
  state: ReadonlyReducerState,
  action: ServerActionAction
): ReducerState {
  const suspended = state.suspended
  const needsRefresh = suspended !== null && suspended.needsRefresh

  // Actions requests are currently sent on whatever the current URL was when
  // the action was invoked by the client.
  // TODO: If a navigation happens simultaneously (within the same task) as
  // an action, we should send the action request to the new URL, not the
  // current one.
  const urlOfPageToInvokeActionOn = new URL(state.canonicalUrl, location.origin)

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

  scheduleServerAction(
    urlOfPageToInvokeActionOn,
    state.tree,
    nextUrl,
    needsRefresh,
    action.actionId,
    action.actionArgs,
    action.resolve,
    action.reject
  )

  // Suspend the router until the server responds.
  return handleSuspendedNavigation(state, needsRefresh)
}

export function dispatchNavigationOnServerActionResponse(
  baseTree: FlightRouterState,
  resolve: (value: any) => void,
  reject: (reason?: any) => void,
  result: FetchServerActionResult
) {
  const {
    revalidationKind,
    actionResult,
    actionFlightData: flightData,
    actionFlightDataRenderedSearch: flightDataRenderedSearch,
    redirectLocation,
    redirectType: unresolvedRedirectType,
  } = result

  const redirectType = unresolvedRedirectType ?? RedirectType.push

  // If there was a revalidation, evict the entire prefetch cache.
  // TODO: Evict only segments with matching tags and/or paths.
  if (revalidationKind === ActionDidRevalidateStaticAndDynamic) {
    // TODO: Consider combining this with the `needsRefresh` logic in
    // navigate-reducer.
    const currentAppRouterState = getCurrentAppRouterState()
    if (currentAppRouterState !== null) {
      revalidateEntireCache(
        currentAppRouterState.nextUrl,
        currentAppRouterState.tree
      )
    }
  }

  if (redirectLocation !== undefined) {
    // If the action triggered a redirect, the action promise will be rejected with
    // a redirect so that it's handled by RedirectBoundary as we won't have a valid
    // action result to resolve the promise with. This will effectively reset the state of
    // the component that called the action as the error boundary will remount the tree.
    // The status code doesn't matter here as the action handler will have already sent
    // a response with the correct status code.
    const redirectHref = createHrefFromUrl(redirectLocation, false)
    const redirectError = getRedirectError(
      hasBasePath(redirectHref) ? removeBasePath(redirectHref) : redirectHref,
      redirectType
    )
    // We mark the error as handled because we don't want the redirect to be tried later by
    // the RedirectBoundary, in case the user goes back and `Activity` triggers the redirect
    // again, as it's run within an effect.
    // We don't actually need the RedirectBoundary to do a router.push because we already
    // have all the necessary RSC data to render the new page within a single roundtrip.
    ;(redirectError as any).handled = true
    reject(redirectError)
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
    dispatchNoOpOnServerActionResponse()
    return
  }

  if (flightData === undefined && redirectLocation !== undefined) {
    // The server redirected, but did not send any Flight data. This implies
    // an external redirect.
    // TODO: We should refactor the action response type to be more explicit
    // about the various response types.
    // TODO: We currently assume that if no Flight data was sent, thent the
    // redirect is to an external URL, but this may change in the future.
    dispatchExternalRedirectOnServerActionResponse(
      redirectLocation,
      redirectType
    )
    return
  }

  if (typeof flightData === 'string') {
    // If the flight data is just a string, something earlier in the
    // response handling triggered an external redirect.
    dispatchExternalRedirectOnServerActionResponse(
      new URL(flightData, location.origin),
      redirectType
    )
    return
  }

  // The Server Action triggered a navigation — either a redirect, a revalidation,
  // or both.
  //
  // This is modeled the same as a normal navigation via <Link> or
  // router.push(), or the same as a refresh (which is itself modeled the same
  // as a navigation to the current URL) — in fact, most of the implementation
  // from this point on is identical

  let seed = null
  let asyncDebugInfo = null
  if (flightData !== undefined && flightDataRenderedSearch !== undefined) {
    // The server sent back new route data as part of the response. We
    // will use this to render the new page. If this happens to be only a
    // subset of the data needed to render the new page, we'll initiate a
    // new fetch, like we would for a normal navigation.
    seed = convertServerPatchToFullTree(
      baseTree,
      flightData,
      flightDataRenderedSearch,
      asyncDebugInfo
    )

    // TODO: Transfer the debug info from the Flight response
    // asyncDebugInfo = ...
  }

  const isExternalUrl = false
  const needsRefresh = revalidationKind !== ActionDidNotRevalidate
  dispatchAppRouterAction({
    type: ACTION_NAVIGATE,
    url:
      redirectLocation !== undefined
        ? // If there was no redirect, then this is treated as a refresh.
          redirectLocation
        : null,
    isExternalUrl,
    shouldScroll: true,
    navigateType: redirectType,
    shouldRefreshDynamicData: needsRefresh,
    seed,
    continuationId: null,
  })
}

export function dispatchNoOpOnServerActionResponse() {
  dispatchAppRouterAction({
    type: ACTION_NAVIGATE,
    url: null,
    isExternalUrl: false,
    shouldScroll: false,
    navigateType: 'replace',
    shouldRefreshDynamicData: false,
    seed: null,
    continuationId: null,
  })
}

function dispatchExternalRedirectOnServerActionResponse(
  url: URL | null,
  redirectType: RedirectType
) {
  dispatchAppRouterAction({
    type: ACTION_NAVIGATE,
    url,
    isExternalUrl: true,
    shouldScroll: true,
    navigateType: redirectType,
    shouldRefreshDynamicData: false,
    seed: null,
    continuationId: null,
  })
}
