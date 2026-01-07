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

import type { ReadonlyReducerState } from '../router-reducer-types'
import { assignLocation } from '../../../assign-location'
import { createHrefFromUrl } from '../create-href-from-url'
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
import { revalidateEntireCache } from '../../segment-cache/cache'
import { getDeploymentId } from '../../../../shared/lib/deployment-id'
import {
  convertServerPatchToFullTree,
  type NavigationSeed,
} from '../../segment-cache/navigation'
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
import {
  getCurrentAppRouterState,
  type ServerActionRouterTask,
} from './router-task'
import { markServerActionTaskAsReady } from './server-action-scheduler'

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
  isPrerender: boolean
}

export async function fetchServerAction(
  urlOfPageToInvokeActionOn: URL,
  nextUrl: ReadonlyReducerState['nextUrl'],
  baseTree: FlightRouterState,
  actionId: string,
  actionArgs: any[]
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
    [NEXT_ROUTER_STATE_TREE_HEADER]:
      prepareFlightRouterStateForRequest(baseTree),
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
  }
}

export function handleServerActionResult(
  task: ServerActionRouterTask,
  url: URL,
  baseTree: FlightRouterState,
  result: FetchServerActionResult
): void {
  const call = task.data
  const revalidationKind = result.revalidationKind
  const redirectLocation = result.redirectLocation
  const redirectType = result.redirectType
  const actionResult = result.actionResult
  const flightData = result.actionFlightData
  const flightDataRenderedSearch = result.actionFlightDataRenderedSearch

  let freshness: FreshnessPolicy
  if (revalidationKind !== ActionDidNotRevalidate) {
    // There was either a revalidation or a refresh, or maybe both.

    // Evict the BFCache, which may contain dynamic data.
    invalidateBfCache()

    // If there was a revalidation, evict the entire prefetch cache.
    // TODO: Evict only segments with matching tags and/or paths.
    if (revalidationKind === ActionDidRevalidateStaticAndDynamic) {
      const currentState = getCurrentAppRouterState()
      if (currentState !== null) {
        revalidateEntireCache(currentState.nextUrl, currentState.tree)
      }
    }

    freshness = FreshnessPolicy.RefreshAll
  } else {
    freshness =
      redirectLocation !== undefined || flightData !== undefined
        ? FreshnessPolicy.RefreshAll
        : // If there was no revalidation, no refresh, no redirect, and the
          // server did not send back any new data, then the action effectively
          // becomes a no-op.
          FreshnessPolicy.Restore
  }

  const navigateType = redirectType || 'push'

  let seed: NavigationSeed | null = null
  if (
    flightData !== undefined &&
    typeof flightData !== 'string' &&
    flightDataRenderedSearch !== undefined
  ) {
    // The server sent back new route data as part of the response. We
    // will use this to render the new page. If this happens to be only a
    // subset of the data needed to render the new page, we'll initiate a
    // new fetch, like we would for a normal navigation.
    seed = convertServerPatchToFullTree(
      baseTree,
      flightData,
      flightDataRenderedSearch
    )
  }

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
      markServerActionTaskAsReady(
        task,
        redirectLocation,
        null,
        navigateType,
        freshness
      )
      call.reject(redirectError)
      return
    }

    // Internal redirect. Triggers an SPA navigation.
    const redirectWithBasepath = createHrefFromUrl(redirectLocation, false)
    const redirectHref = hasBasePath(redirectWithBasepath)
      ? removeBasePath(redirectWithBasepath)
      : redirectWithBasepath
    const redirectError = createRedirectErrorForAction(
      redirectHref,
      navigateType
    )
    markServerActionTaskAsReady(
      task,
      redirectLocation,
      seed,
      navigateType,
      freshness
    )
    call.reject(redirectError)
    return
  }

  // There was no redirect, so treat this as a refresh. The refreshed data will
  // only be applied if there isn't a subsequent navigation.
  markServerActionTaskAsReady(task, url, seed, navigateType, freshness)
  call.fulfill(actionResult)
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
