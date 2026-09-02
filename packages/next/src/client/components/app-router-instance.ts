import {
  type AppRouterState,
  type ReducerActions,
  type ReducerState,
  ACTION_REFRESH,
  ACTION_SERVER_ACTION,
  ACTION_NAVIGATE,
  ACTION_RESTORE,
  ScrollBehavior,
} from './router-reducer/router-reducer-types'
import { reducer } from './router-reducer/router-reducer'
import { startTransition } from 'react'
import { isThenable } from '../../shared/lib/is-thenable'
import { navigate } from './app-router-state'
import { dispatchGestureState } from './use-action-queue'
import { FreshnessPolicy } from './render-tree'
import { addBasePath } from '../add-base-path'
import { isExternalURL } from './app-router-utils'
import type {
  AppRouterInstance,
  NavigateOptions,
} from '../../shared/lib/app-router-context.shared-runtime'
import type { GlobalErrorComponent } from './builtin/global-error'
import { isJavaScriptURLString } from '../lib/javascript-url'
import { push, replace, refresh, hmrRefresh } from './navigator'
import { prefetchRoute } from './prefetch'

export type DispatchStatePromise = React.Dispatch<ReducerState>

export type AppRouterActionQueue = {
  state: AppRouterState
  dispatch: (payload: ReducerActions, setState: DispatchStatePromise) => void
  action: (state: AppRouterState, action: ReducerActions) => ReducerState

  pending: ActionQueueNode | null
  needsRefresh?: boolean
  wasPreempted?: boolean
  last: ActionQueueNode | null
}

export type GlobalErrorState = [
  GlobalError: GlobalErrorComponent,
  styles: React.ReactNode,
]

export type ActionQueueNode = {
  payload: ReducerActions
  next: ActionQueueNode | null
  resolve: (value: ReducerState) => void
  reject: (err: Error) => void
  discarded?: boolean
}

function runRemainingActions(
  actionQueue: AppRouterActionQueue,
  settledAction: ActionQueueNode,
  setState: DispatchStatePromise
) {
  // Only advance the queue if the settled action is still at its head. If a
  // navigation discarded this action, the navigation took its place and is
  // still in flight — starting the next queued action now would run it
  // against router state that doesn't include the navigation yet.
  if (actionQueue.pending === settledAction) {
    actionQueue.pending = settledAction.next
    if (actionQueue.pending !== null) {
      runAction({
        actionQueue,
        action: actionQueue.pending,
        setState,
      })
      return
    }
  }

  if (actionQueue.pending === null) {
    if (actionQueue.wasPreempted) {
      actionQueue.wasPreempted = false
      // When an action is preempted, later actions can update the queue's state without React rendering it.
      // Once the queue is empty, publish the final state so the UI catches up.
      startTransition(() => setState(actionQueue.state))
    }

    if (actionQueue.needsRefresh) {
      // The queue is idle; flush the refresh requested by a discarded server
      // action that revalidated data.
      actionQueue.needsRefresh = false
      actionQueue.dispatch({ type: ACTION_REFRESH }, setState)
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

  actionQueue.pending = action

  const payload = action.payload
  const actionResult = actionQueue.action(prevState, payload)

  function handleResult(nextState: AppRouterState) {
    // if we discarded this action, the state should also be discarded
    if (action.discarded) {
      // Check if the discarded server action revalidated data
      if (
        action.payload.type === ACTION_SERVER_ACTION &&
        action.payload.didRevalidate
      ) {
        // The server action was discarded but it revalidated data,
        // mark that we need to refresh after all actions complete
        actionQueue.needsRefresh = true
      }
      // This can't advance the queue (this action is no longer its head), but
      // if the queue has already drained, it flushes the refresh now.
      runRemainingActions(actionQueue, action, setState)
      return
    }

    actionQueue.state = nextState

    runRemainingActions(actionQueue, action, setState)
    action.resolve(nextState)
  }

  // if the action is a promise, set up a callback to resolve it
  if (isThenable(actionResult)) {
    actionResult.then(handleResult, (err) => {
      runRemainingActions(actionQueue, action, setState)
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
    resolve: resolvers.resolve,
    reject: resolvers.reject,
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
  } else if (
    payload.type === ACTION_NAVIGATE ||
    payload.type === ACTION_RESTORE
  ) {
    // Navigations (including back/forward) take priority over any pending actions.
    // Mark the pending action as discarded (so the state is never applied) and start the navigation action immediately.
    actionQueue.pending.discarded = true
    actionQueue.wasPreempted = true

    // The rest of the current queue should still execute after this navigation.
    // (Note that it can't contain any earlier navigations, because we always put those into `actionQueue.pending` by calling `runAction`)
    newAction.next = actionQueue.pending.next

    if (actionQueue.last === actionQueue.pending) {
      actionQueue.last = newAction
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

let globalActionQueue: AppRouterActionQueue | null = null

export function createMutableActionQueue(
  initialState: AppRouterState
): AppRouterActionQueue {
  const actionQueue: AppRouterActionQueue = {
    state: initialState,
    dispatch: (payload: ReducerActions, setState: DispatchStatePromise) =>
      dispatchAction(actionQueue, payload, setState),
    action: async (state: AppRouterState, action: ReducerActions) => {
      const result = reducer(state, action)
      return result
    },
    pending: null,
    last: null,
  }

  if (typeof window !== 'undefined') {
    // The action queue is lazily created on hydration, but after that point
    // it doesn't change. So we can store it in a global rather than pass
    // it around everywhere via props/context.
    if (globalActionQueue !== null) {
      throw new Error(
        'Internal Next.js Error: createMutableActionQueue was called more ' +
          'than once'
      )
    }
    globalActionQueue = actionQueue
  }

  return actionQueue
}

export function getCurrentAppRouterState(): AppRouterState | null {
  return globalActionQueue !== null ? globalActionQueue.state : null
}

/**
 * (Experimental) Perform a gesture navigation. This dispatches through React's
 * useOptimistic instead of the main action queue, allowing the state to be
 * shown during a gesture transition and discarded when the canonical navigation
 * completes.
 *
 * Only available when experimental.gestureTransition is enabled.
 */
function gesturePush(href: string, options?: NavigateOptions): void {
  if (process.env.__NEXT_GESTURE_TRANSITION) {
    // TODO: Trigger a prefetch so the cache starts populating if there isn't
    // already a prefetch for this route.
    if (isJavaScriptURLString(href)) {
      throw new Error(
        'Next.js has blocked a javascript: URL as a security precaution.'
      )
    }

    const state = getCurrentAppRouterState()
    if (state === null) {
      return
    }
    const url = new URL(addBasePath(href), location.href)
    if (isExternalURL(url)) {
      return
    }

    // Fork the router state for the duration of the gesture transition.
    const currentUrl = new URL(state.canonicalUrl, location.href)
    const scrollBehavior =
      options?.scroll === false
        ? ScrollBehavior.NoScroll
        : ScrollBehavior.Default
    // This is a special freshness policy that prevents dynamic requests from
    // being spawned. During the gesture, we should only show the cached
    // prefetched UI, not dynamic data.
    // TODO: In the case of navigations to an unknown route, this will still
    // end up performing a dynamic request. The plan is to do prefetch instead.
    // There's a separate TODO for this.
    const freshnessPolicy = FreshnessPolicy.Gesture
    const forkedGestureState = navigate(
      state,
      url,
      currentUrl,
      state.renderedSearch,
      state.cache,
      state.tree,
      state.nextUrl,
      freshnessPolicy,
      scrollBehavior,
      'push'
    )
    dispatchGestureState(forkedGestureState)
  }
}

/**
 * The app router that is exposed through `useRouter`. These are public API
 * methods. Internal Next.js code should call the lower level methods directly
 * (although there's lots of existing code that doesn't do that).
 */
export const publicAppRouterInstance: AppRouterInstance = {
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  prefetch: prefetchRoute,
  replace: replace,
  push: push,
  refresh: refresh,
  hmrRefresh: hmrRefresh,
  // Default value. Each route segment provides its own value at runtime. Refer
  // to `useRouter()`.
  bfcacheId: '0',
}

// Conditionally add experimental_gesturePush when gestureTransition is enabled
if (process.env.__NEXT_GESTURE_TRANSITION) {
  ;(publicAppRouterInstance as any).experimental_gesturePush = gesturePush
}

// Exists for debugging purposes. Don't use in application code.
if (typeof window !== 'undefined' && window.next) {
  window.next.router = publicAppRouterInstance
}
