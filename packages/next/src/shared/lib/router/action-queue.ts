import {
  isThenable,
  type AppRouterState,
  type ReducerActions,
  type ReducerState,
  ACTION_REFRESH,
  ACTION_SERVER_ACTION,
  ACTION_NAVIGATE,
  ACTION_RESTORE,
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
  needsRefresh?: boolean
  last: ActionQueueNode | null
}

export type ActionQueueNode = {
  payload: ReducerActions
  next: ActionQueueNode | null
  resolve: (value: ReducerState) => void
  reject: (err: Error) => void
  discarded?: boolean
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

  actionQueue.pending = action

  const payload = action.payload
  const actionResult = actionQueue.action(prevState, payload)

  function handleResult(nextState: AppRouterState) {
    // if we discarded this action, the state should also be discarded
    if (action.discarded) {
      // if a refresh is needed, we only want to trigger it once the action queue is empty
      if (actionQueue.needsRefresh && actionQueue.pending === null) {
        actionQueue.needsRefresh = false
        actionQueue.dispatch(
          {
            type: ACTION_REFRESH,
            origin: window.location.origin,
          },
          setState
        )
      }
      return
    }

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
    resolve: (value: ReducerState) => void
    reject: (reason: any) => void
  } = { resolve: setState, reject: () => {} }

  // most of the action types are async with the exception of restore
  // it's important that restore is handled quickly since it's fired on the popstate event
  // and we don't want to add any delay on a back/forward nav
  // this only creates a promise for the async actions
  if (payload.type !== ACTION_RESTORE) {
    // Create the promise and assign the resolvers to the object.
    const deferredPromise = new Promise<AppRouterState>((resolve, reject) => {
      resolvers = { resolve, reject }
    })

    startTransition(() => {
      // we immediately notify React of the pending promise -- the resolver is attached to the action node
      // and will be called when the associated action promise resolves
      setState(deferredPromise)
    })
  }

  const newAction: ActionQueueNode = {
    payload,
    next: null,
    resolve: resolvers!.resolve,
    reject: resolvers!.reject,
  }

  // Check if the queue is empty
  if (actionQueue.pending === null) {
    // The queue is empty, so add the action and start it immediately
    // Mark this action as the last in the queue
    actionQueue.last = newAction

    runAction({
      actionQueue,
      action: newAction,
      setState,
    })
  } else if (payload.type === ACTION_NAVIGATE) {
    // Navigations take priority over any pending actions.
    // Mark the pending action as discarded (so the state is never applied) and start the navigation action immediately.
    actionQueue.pending.discarded = true

    // Mark this action as the last in the queue
    actionQueue.last = newAction

    // if the pending action was a server action, mark the queue as needing a refresh once events are processed
    if (actionQueue.pending.payload.type === ACTION_SERVER_ACTION) {
      actionQueue.needsRefresh = true
    }

    runAction({
      actionQueue,
      action: newAction,
      setState,
    })
  } else {
    // The queue is not empty, so add the action to the end of the queue
    // It will be started by runRemainingActions after the previous action finishes
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
