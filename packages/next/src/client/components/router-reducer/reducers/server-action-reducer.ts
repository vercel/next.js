import {
  ActionFlightData,
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

type FetchServerActionResult = {
  result: ActionFlightData | undefined
  redirectLocation: URL | undefined
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

  if (!res.ok) {
    throw new Error(await res.text())
  }

  const location = res.headers.get('location')

  const redirectLocation = location
    ? new URL(addBasePath(location), window.location.origin)
    : undefined

  let isFlightResponse =
    res.headers.get('content-type') === RSC_CONTENT_TYPE_HEADER

  const result = isFlightResponse
    ? await createFromFetch(Promise.resolve(res), {
        callServer,
      })
    : undefined

  return { result, redirectLocation }
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
    action.mutable.inFlightServerAction = createRecordFromThenable(
      fetchServerAction(state, action)
    )
  }
  try {
    // suspends until the server action is resolved.
    const { result, redirectLocation } = readRecordValue(
      action.mutable.inFlightServerAction!
    ) as Awaited<FetchServerActionResult>

    if (redirectLocation) {
      const flightData = result as FlightData | undefined

      // the redirection might have a flight data associated with it, so we'll populate the cache with it
      if (flightData) {
        const href = createHrefFromUrl(
          redirectLocation,
          // Ensures the hash is not part of the cache key as it does not affect fetching the server
          false
        )
        state.prefetchCache.set(href, {
          data: createRecordFromThenable(
            Promise.resolve([
              flightData,
              // TODO: verify the logic around canonical URL overrides
              undefined,
            ])
          ),
          kind: PrefetchKind.TEMPORARY, //TODO: maybe this could cached longer?
          prefetchTime: Date.now(),
          treeAtTimeOfPrefetch: action.mutable.previousTree!,
          lastUsedTime: null,
        })
      }

      // TODO: do this instead when experimental React is enabled
      // action.reject(getRedirectError(redirectLocation.toString()))

      // this is an intentional hack around React: we want to redirect in a new render
      setTimeout(() => {
        action.navigate(redirectLocation.toString(), 'push', !flightData)
      })
    } else {
      const [actionResult, flightData] = result ?? [undefined, undefined]
      // TODO: populate the prefetch cache with the new flight data
      if (flightData) {
        // this is an intentional hack around React: we want to update the tree in a new render
        setTimeout(() => {
          action.changeByServerResponse(
            action.mutable.previousTree!,
            flightData,
            // TODO: verify the logic around canonical URL overrides
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
      // it's an unresolved promise, so we want to keep suspending
      throw e
    }
  }

  action.mutable.serverActionApplied = true
  return state
}
