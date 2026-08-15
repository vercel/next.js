import { startTransition } from 'react'
import { ACTION_SERVER_ACTION } from './components/router-reducer/router-reducer-types'
import { dispatchAppRouterAction } from './components/use-action-queue'

/**
 * Invoke a Server Action. The returned promise resolves with the action's
 * return value once the response has been processed. Navigation and
 * revalidation side effects of the action are handled by the router; they are
 * not observable through the returned promise.
 */
export async function callServer(actionId: string, actionArgs: any[]) {
  return new Promise((resolve, reject) => {
    startTransition(() => {
      dispatchAppRouterAction({
        type: ACTION_SERVER_ACTION,
        actionId,
        actionArgs,
        resolve,
        reject,
      })
    })
  })
}
