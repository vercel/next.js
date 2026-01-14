import { startTransition } from 'react'
import { ACTION_SERVER_ACTION } from './components/router-reducer/router-reducer-types'
import { dispatchAppRouterAction } from './components/router-reducer/reducers/router-task'

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
