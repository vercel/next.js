import { startTransition } from 'react'
import { ACTION_SERVER_ACTION } from './components/router-reducer/router-reducer-types'
import { dispatchAppRouterAction } from './components/use-action-queue'
import {
  getServerActionDispatchContext,
  type ServerActionDispatchScope,
} from './server-action-dispatch'

function dispatchServerAction(
  actionId: string,
  actionArgs: any[],
  scope?: ServerActionDispatchScope
) {
  return new Promise((resolve, reject) => {
    startTransition(() => {
      dispatchAppRouterAction({
        type: ACTION_SERVER_ACTION,
        actionId,
        actionArgs,
        actionDispatchContext: getServerActionDispatchContext(actionId, scope),
        resolve,
        reject,
      })
    })
  })
}

export async function callServer(actionId: string, actionArgs: any[]) {
  return dispatchServerAction(actionId, actionArgs)
}

export function createScopedCallServer(scope: ServerActionDispatchScope) {
  return (actionId: string, actionArgs: any[]) =>
    dispatchServerAction(actionId, actionArgs, scope)
}
