import {
  ActionFlightData,
  ActionResult,
  FlightData,
} from '../../../../server/app-render/types'
import { callServer } from '../../../app-call-server'
import {
  NEXT_ROUTER_STATE_TREE,
  NEXT_URL,
  RSC_CONTENT_TYPE_HEADER,
} from '../../app-router-headers'
import { createRecordFromThenable } from '../create-record-from-thenable'
import { readRecordValue } from '../read-record-value'
// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromFetch } from 'react-server-dom-webpack/client'
// eslint-disable-next-line import/no-extraneous-dependencies
import { encodeReply } from 'react-server-dom-webpack/client'

import {
  PrefetchKind,
  ReadonlyReducerState,
  ReducerState,
  ServerActionAction,
} from '../router-reducer-types'
import { addBasePath } from '../../../add-base-path'
import { createHrefFromUrl } from '../create-href-from-url'
import { RedirectType, getRedirectError } from '../../redirect'

type FetchServerActionResult = {
  redirectLocation: URL | undefined
  actionResult?: ActionResult
  actionFlightData?: FlightData | undefined | null
}

async function fetchServerAction(
  state: ReadonlyReducerState,
  { actionId, actionArgs }: ServerActionAction
): Promise<FetchServerActionResult> {
  const body = await encodeReply(actionArgs)

  const res = await fetch('', {
    method: 'POST',
    headers: {
      Accept: RSC_CONTENT_TYPE_HEADER,
      'Next-Action': actionId,
      [NEXT_ROUTER_STATE_TREE]: JSON.stringify(state.tree),
      ...(state.nextUrl
        ? {
            [NEXT_URL]: state.nextUrl,
          }
        : {}),
    },
    body,
  })

  const location = res.headers.get('x-action-redirect')

  const redirectLocation = location
    ? new URL(addBasePath(location), window.location.origin)
    : undefined

  let isFlightResponse =
    res.headers.get('content-type') === RSC_CONTENT_TYPE_HEADER

  if (isFlightResponse) {
    const result = await createFromFetch(Promise.resolve(res), {
      callServer,
    })
    // if it was a redirection, then result is just a regular RSC payload
    if (location) {
      return {
        actionFlightData: result as FlightData,
        redirectLocation,
      }
      // otherwise it's a tuple of [actionResult, actionFlightData]
    } else {
      const [actionResult, actionFlightData] =
        (result as ActionFlightData | undefined) ?? []
      return {
        actionResult,
        actionFlightData,
        redirectLocation,
      }
    }
  }
  return {
    redirectLocation,
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
  // the action could be called twice so we need to check if we already have applied it
  if (action.mutable.serverActionApplied) {
    return state
  }

  if (!action.mutable.inFlightServerAction) {
    action.mutable.previousTree = state.tree
    action.mutable.previousUrl = state.canonicalUrl
    action.mutable.inFlightServerAction = createRecordFromThenable(
      fetchServerAction(state, action)
    )
  }
  try {
    // suspends until the server action is resolved.
    const { actionResult, actionFlightData, redirectLocation } =
      readRecordValue(
        action.mutable.inFlightServerAction!
      ) as Awaited<FetchServerActionResult>

    if (redirectLocation) {
      // the redirection might have a flight data associated with it, so we'll populate the cache with it
      if (actionFlightData) {
        const href = createHrefFromUrl(redirectLocation, false)
        const previousCacheEntry = state.prefetchCache.get(href)
        state.prefetchCache.set(href, {
          data: createRecordFromThenable(
            Promise.resolve([
              actionFlightData,
              // TODO-APP: verify the logic around canonical URL overrides
              undefined,
            ])
          ),
          kind: previousCacheEntry?.kind ?? PrefetchKind.TEMPORARY,
          prefetchTime: Date.now(),
          treeAtTimeOfPrefetch: action.mutable.previousTree!,
          lastUsedTime: null,
        })
      }

      // we throw the redirection in the action handler so that it is caught during render
      action.reject(
        getRedirectError(redirectLocation.toString(), RedirectType.push)
      )
    } else {
      if (actionFlightData) {
        const href = createHrefFromUrl(
          new URL(action.mutable.previousUrl!, window.location.origin),
          false
        )
        const previousCacheEntry = state.prefetchCache.get(href)
        state.prefetchCache.set(
          createHrefFromUrl(
            new URL(action.mutable.previousUrl!, window.location.origin),
            false
          ),
          {
            data: createRecordFromThenable(
              Promise.resolve([
                actionFlightData,
                // TODO-APP: verify the logic around canonical URL overrides
                undefined,
              ])
            ),
            kind: previousCacheEntry?.kind ?? PrefetchKind.TEMPORARY,
            prefetchTime: Date.now(),
            treeAtTimeOfPrefetch: action.mutable.previousTree!,
            lastUsedTime: null,
          }
        )
        // this is an intentional hack around React: we want to update the tree in a new render
        setTimeout(() => {
          action.changeByServerResponse(
            action.mutable.previousTree!,
            actionFlightData,
            // TODO-APP: verify the logic around canonical URL overrides
            undefined
          )
        })
      }

      action.resolve(actionResult)
    }
  } catch (e: any) {
    if (e.status === 'rejected') {
      action.reject(e.value)
    } else {
      throw e
    }
  }

  action.mutable.serverActionApplied = true
  return state
}
