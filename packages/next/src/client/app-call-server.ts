import { startTransition } from 'react'
import { ACTION_SERVER_ACTION } from './components/router-reducer/router-reducer-types'
import { dispatchAppRouterAction } from './components/use-action-queue'

function getCurrentActionDispatchPath() {
  if (typeof window === 'undefined') {
    return undefined
  }
  return window.location.pathname + window.location.search
}

export function createBoundActionCallServer(
  actionDispatchPath = getCurrentActionDispatchPath()
) {
  return (actionId: string, actionArgs: any[]) =>
    callServer(actionId, actionArgs, actionDispatchPath)
}

export async function callServer(
  actionId: string,
  actionArgs: any[],
  actionDispatchPath = getCurrentActionDispatchPath()
) {
  return new Promise((resolve, reject) => {
    startTransition(() => {
      dispatchAppRouterAction({
        type: ACTION_SERVER_ACTION,
        actionId,
        actionArgs,
        actionDispatchPath,
        resolve,
        reject,
      })
    })
  })
}
