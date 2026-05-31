import { startTransition } from 'react'
import { ACTION_SERVER_ACTION } from './components/router-reducer/router-reducer-types'
import { dispatchAppRouterAction } from './components/use-action-queue'

export async function callServer(actionId: string, actionArgs: any[]) {
  if (process.env.__NEXT_EXPERIMENTAL_PARALLEL_SERVER_FUNCTIONS) {
    // Lazy require: `callServer` is imported across the router graph, and
    // `server-action-reducer` imports `callServer` back (static cycle). The
    // require breaks the cycle and lets this branch DCE when the flag is off.
    const { callServerParallel } =
      require('./components/router-reducer/reducers/server-action-reducer') as typeof import('./components/router-reducer/reducers/server-action-reducer')
    return callServerParallel(actionId, actionArgs)
  } else {
    return new Promise((resolve, reject) => {
      startTransition(() => {
        dispatchAppRouterAction({
          type: ACTION_SERVER_ACTION,
          actionId,
          actionArgs,
          resolve,
          reject,
          // Only provided from the parallel path flagged above.
          // The legacy path will fetch inside the action queue.
          fetchResult: null,
          // Only provided from the parallel path flagged above.
          // Legacy fetches and commits in the same reducer step,
          // against one `state`, so the tree is identical at fetch
          // and at commit: the result can't be stale.
          //
          // Whereas the parallel path fetches off-queue, so a
          // navigation or refresh can commit and change the tree
          // between the fetch and this commit. `expectedTree` records
          // the tree at fetch time, so the commit can compare it with
          // the current tree and detect whether the result is stale.
          expectedTree: null,
        })
      })
    })
  }
}
