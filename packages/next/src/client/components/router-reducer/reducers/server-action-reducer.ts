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
import { createFromFetch } from 'next/dist/compiled/react-server-dom-webpack/client'
import { encodeReply } from 'next/dist/compiled/react-server-dom-webpack/client'

import {
  PrefetchKind,
  ReadonlyReducerState,
  ReducerState,
  ServerActionAction,
} from '../router-reducer-types'
import { addBasePath } from '../../../add-base-path'
import { createHrefFromUrl } from '../create-href-from-url'
import React from 'react'
import { getRedirectError, redirect } from '../../redirect'

async function fetchServerAction(
  state: ReadonlyReducerState,
  { actionId, actionArgs }: ServerActionAction
) {
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

  const location = res.headers.get('location')
  const redirectLocation = location
    ? new URL(addBasePath(location), window.location.origin)
    : null

  let isFlightResponse =
    res.headers.get('content-type') === RSC_CONTENT_TYPE_HEADER

  const result = isFlightResponse
    ? await createFromFetch(Promise.resolve(res), {
        callServer,
      })
    : undefined

  return { result, redirectLocation }
}

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

  // suspends until the server action is resolved.
  const { result, redirectLocation } = readRecordValue(
    action.mutable.inFlightServerAction!
  ) as {
    result: ActionFlightData | undefined
    redirectLocation: URL | null
  }

  if (redirectLocation) {
    const flightData = result as FlightData | undefined
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
        kind: PrefetchKind.TEMPORARY,
        prefetchTime: Date.now(),
        treeAtTimeOfPrefetch: action.mutable.previousTree!,
        lastUsedTime: null,
      })
    }

    // action.reject(getRedirectError(redirectLocation.toString()))

    setTimeout(() => {
      action.navigate(redirectLocation.toString(), 'push', !flightData)
    })
  } else {
    const [actionResult, flightData] = result ?? [undefined, undefined]
    if (flightData) {
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
  action.mutable.serverActionApplied = true

  return state
}
