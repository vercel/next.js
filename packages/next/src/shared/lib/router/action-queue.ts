import {
  isThenable,
  type AppRouterState,
  type ReducerActions,
  type ReducerState,
} from '../../../client/components/router-reducer/router-reducer-types'
import type { ReduxDevToolsInstance } from '../../../client/components/use-reducer-with-devtools'
import { reducer } from '../../../client/components/router-reducer/router-reducer'
import React, { startTransition } from 'react'

export type DispatchStatePromise = React.Dispatch<ReducerState>

export type AppRouterActionQueue = {
  state: AppRouterState | null
  devToolsInstance?: ReduxDevToolsInstance
  dispatch: (payload: ReducerActions, setState: DispatchStatePromise) => void
  action: (state: AppRouterState, action: ReducerActions) => ReducerState
  pending: ActionQueueNode | null
  last: ActionQueueNode | null
}

export type ActionQueueNode = {
  payload: ReducerActions
  next: ActionQueueNode | null
  resolve: (value: PromiseLike<AppRouterState> | AppRouterState) => void
  reject: (err: Error) => void
}

export const ActionQueueContext =
  React.createContext<AppRouterActionQueue | null>(null)

function runRemainingActions(
  actionQueue: AppRouterActionQueue,
  setState: DispatchStatePromise
) {
  if (actionQueue.pending !== null) {
    actionQueue.pending = actionQueue.pending.next
    if (actionQueue.pending !== null) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      runAction({
        actionQueue,
        action: actionQueue.pending,
        setState,
      })
    }
  }
}

async function runAction({
  actionQueue,
  action,
  setState,
}: {
  actionQueue: AppRouterActionQueue
  action: ActionQueueNode
  setState: DispatchStatePromise
}) {
  const prevState = actionQueue.state
  if (!prevState) {
    // This shouldn't happen as the state is initialized in the dispatcher if it's not set
    throw new Error('Invariant: Router state not initialized')
  }

  const payload = action.payload
  const actionResult = actionQueue.action(prevState, payload)

  function handleResult(nextState: AppRouterState) {
    actionQueue.state = nextState

    if (actionQueue.devToolsInstance) {
      actionQueue.devToolsInstance.send(payload, nextState)
    }

    runRemainingActions(actionQueue, setState)
    action.resolve(nextState)
  }

  // if the action is a promise, set up a callback to resolve it
  if (isThenable(actionResult)) {
    actionResult.then(handleResult, (err) => {
      runRemainingActions(actionQueue, setState)
      action.reject(err)
    })
  } else {
    handleResult(actionResult)
  }
}

function dispatchAction(
  actionQueue: AppRouterActionQueue,
  payload: ReducerActions,
  setState: DispatchStatePromise
) {
  let resolvers: {
    resolve: (value: AppRouterState | PromiseLike<AppRouterState>) => void
    reject: (reason: any) => void
  }

  // Create the promise and assign the resolvers to the object.
  const deferredPromise = new Promise<AppRouterState>((resolve, reject) => {
    resolvers = { resolve, reject }
  })

  const newAction: ActionQueueNode = {
    payload,
    next: null,
    resolve: resolvers!.resolve,
    reject: resolvers!.reject,
  }

  startTransition(() => {
    // we immediately notify React of the pending promise -- the resolver is attached to the action node
    // and will be called when the associated action promise resolves
    setState(deferredPromise)
  })

  // Check if the queue is empty or if the action is a navigation action
  if (actionQueue.pending === null || payload.type === 'navigate') {
    // The queue is empty, so add the action and start it immediately
    // We also immediately start navigations as those shouldn't be blocked
    actionQueue.pending = newAction
    actionQueue.last = newAction
    runAction({
      actionQueue,
      action: newAction,
      setState,
    })
  } else {
    // The queue is not empty, so add the action to the end of the queue
    // It will be started by finishRunningAction after the previous action finishes
    if (actionQueue.last !== null) {
      actionQueue.last.next = newAction
    }
    actionQueue.last = newAction
  }
}

export function createMutableActionQueue(): AppRouterActionQueue {
  const actionQueue: AppRouterActionQueue = {
    state: null,
    dispatch: (payload: ReducerActions, setState: DispatchStatePromise) =>
      dispatchAction(actionQueue, payload, setState),
    action: async (state: AppRouterState, action: ReducerActions) => {
      if (state === null) {
        throw new Error('Invariant: Router state not initialized')
      }
      const result = reducer(state, action)
      return result
    },
    pending: null,
    last: null,
  }

  return actionQueue
}
