import { startTransition, useCallback } from 'react'
import {
  ACTION_SERVER_ACTION,
  type ReducerActions,
  type ServerActionDispatcher,
} from './components/router-reducer/router-reducer-types'

let globalServerActionDispatcher = null as ServerActionDispatcher | null

export function useServerActionDispatcher(
  dispatch: React.Dispatch<ReducerActions>
) {
  const serverActionDispatcher: ServerActionDispatcher = useCallback(
    (actionPayload) => {
      startTransition(() => {
        dispatch({
          ...actionPayload,
          type: ACTION_SERVER_ACTION,
        })
      })
    },
    [dispatch]
  )
  globalServerActionDispatcher = serverActionDispatcher
}

export async function callServer(actionId: string, actionArgs: any[]) {
  const actionDispatcher = globalServerActionDispatcher

  if (!actionDispatcher) {
    throw new Error('Invariant: missing action dispatcher.')
  }

  return new Promise((resolve, reject) => {
    actionDispatcher({
      actionId,
      actionArgs,
      resolve,
      reject,
    })
  })
}
