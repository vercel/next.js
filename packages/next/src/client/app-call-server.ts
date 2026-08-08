import { startTransition } from 'react'
import { ACTION_SERVER_ACTION } from './components/router-reducer/router-reducer-types'
import { dispatchAppRouterAction } from './components/use-action-queue'
import { getServerActionDispatchContext } from './server-action-dispatch'

export async function callServer(actionId: string, actionArgs: any[]) {
  const actionDispatchContext = getServerActionDispatchContext(actionId)

  return new Promise((resolve, reject) => {
    startTransition(() => {
      dispatchAppRouterAction({
        type: ACTION_SERVER_ACTION,
        actionId,
        actionArgs,
        actionDispatchContext,
        resolve,
        reject,
      })
    })
  })
}
