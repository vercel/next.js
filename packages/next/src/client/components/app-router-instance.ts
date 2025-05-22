import {
  type AppRouterState,
  type ReducerActions,
  type ReducerState,
  ACTION_REFRESH,
  ACTION_SERVER_ACTION,
  ACTION_NAVIGATE,
  ACTION_RESTORE,
  type NavigateAction,
  ACTION_HMR_REFRESH,
  PrefetchKind,
  ACTION_PREFETCH,
} from './router-reducer/router-reducer-types'
import { reducer } from './router-reducer/router-reducer'
import { startTransition } from 'react'
import { isThenable } from '../../shared/lib/is-thenable'
import { prefetch as prefetchWithSegmentCache } from './segment-cache'
import { dispatchAppRouterAction } from './use-action-queue'
import { addBasePath } from '../add-base-path'
import { createPrefetchURL, isExternalURL } from './app-router'
import { prefetchReducer } from './router-reducer/reducers/prefetch-reducer'
import type {
  AppRouterInstance,
  NavigateOptions,
  PrefetchOptions,
} from '../../shared/lib/app-router-context.shared-runtime'
import { setLinkForCurrentNavigation, type LinkInstance } from './links'
import type { FlightRouterState } from '../../server/app-render/types'
import type { ClientInstrumentationHooks } from '../app-index'

export type DispatchStatePromise = React.Dispatch<ReducerState>

export type AppRouterActionQueue = {
  state: AppRouterState
  dispatch: (payload: ReducerActions, setState: DispatchStatePromise) => void
  action: (state: AppRouterState, action: ReducerActions) => ReducerState

  onRouterTransitionStart:
    | ((url: string, type: 'push' | 'replace' | 'traverse') => void)
    | null

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
    } else {
      // No more actions are pending, check if a refresh is needed
      if (actionQueue.needsRefresh) {
        actionQueue.needsRefresh = false
        actionQueue.dispatch(
          {
            type: ACTION_REFRESH,
            origin: window.location.origin,
          },
          setState
        )
      }
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
      return
    }

    actionQueue.state = nextState

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

    // The rest of the current queue should still execute after this navigation.
    // (Note that it can't contain any earlier navigations, because we always put those into `actionQueue.pending` by calling `runAction`)
    newAction.next = actionQueue.pending.next

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

let globalActionQueue: AppRouterActionQueue | null = null

export function createMutableActionQueue(
  initialState: AppRouterState,
  instrumentationHooks: ClientInstrumentationHooks | null
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
    onRouterTransitionStart:
      instrumentationHooks !== null &&
      typeof instrumentationHooks.onRouterTransitionStart === 'function'
        ? // This profiling hook will be called at the start of every navigation.
          instrumentationHooks.onRouterTransitionStart
        : null,
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

function getAppRouterActionQueue(): AppRouterActionQueue {
  if (globalActionQueue === null) {
    throw new Error(
      'Internal Next.js error: Router action dispatched before initialization.'
    )
  }
  return globalActionQueue
}

function getProfilingHookForOnNavigationStart() {
  if (globalActionQueue !== null) {
    return globalActionQueue.onRouterTransitionStart
  }
  return null
}

export function dispatchNavigateAction(
  href: string,
  navigateType: NavigateAction['navigateType'],
  shouldScroll: boolean,
  linkInstanceRef: LinkInstance | null
): void {
  // TODO: This stuff could just go into the reducer. Leaving as-is for now
  // since we're about to rewrite all the router reducer stuff anyway.
  const url = new URL(addBasePath(href), location.href)
  if (process.env.__NEXT_APP_NAV_FAIL_HANDLING) {
    window.next.__pendingUrl = url
  }

  setLinkForCurrentNavigation(linkInstanceRef)

  const onRouterTransitionStart = getProfilingHookForOnNavigationStart()
  if (onRouterTransitionStart !== null) {
    onRouterTransitionStart(href, navigateType)
  }

  dispatchAppRouterAction({
    type: ACTION_NAVIGATE,
    url,
    isExternalUrl: isExternalURL(url),
    locationSearch: location.search,
    shouldScroll,
    navigateType,
    allowAliasing: true,
  })
}

export function dispatchTraverseAction(
  href: string,
  tree: FlightRouterState | undefined
) {
  const onRouterTransitionStart = getProfilingHookForOnNavigationStart()
  if (onRouterTransitionStart !== null) {
    onRouterTransitionStart(href, 'traverse')
  }
  dispatchAppRouterAction({
    type: ACTION_RESTORE,
    url: new URL(href),
    tree,
  })
}

/**
 * The app router that is exposed through `useRouter`. These are public API
 * methods. Internal Next.js code should call the lower level methods directly
 * (although there's lots of existing code that doesn't do that).
 */
export const publicAppRouterInstance: AppRouterInstance = {
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  prefetch: process.env.__NEXT_CLIENT_SEGMENT_CACHE
    ? // Unlike the old implementation, the Segment Cache doesn't store its
      // data in the router reducer state; it writes into a global mutable
      // cache. So we don't need to dispatch an action.
      (href: string, options?: PrefetchOptions) => {
        const actionQueue = getAppRouterActionQueue()
        prefetchWithSegmentCache(
          href,
          actionQueue.state.nextUrl,
          actionQueue.state.tree,
          options?.kind === PrefetchKind.FULL,
          options?.onInvalidate ?? null
        )
      }
    : (href: string, options?: PrefetchOptions) => {
        // Use the old prefetch implementation.
        const actionQueue = getAppRouterActionQueue()
        const url = createPrefetchURL(href)
        if (url !== null) {
          // The prefetch reducer doesn't actually update any state or
          // trigger a rerender. It just writes to a mutable cache. So we
          // shouldn't bother calling setState/dispatch; we can just re-run
          // the reducer directly using the current state.
          // TODO: Refactor this away from a "reducer" so it's
          // less confusing.
          prefetchReducer(actionQueue.state, {
            type: ACTION_PREFETCH,
            url,
            kind: options?.kind ?? PrefetchKind.FULL,
          })
        }
      },
  replace: (href: string, options?: NavigateOptions) => {
    startTransition(() => {
      dispatchNavigateAction(href, 'replace', options?.scroll ?? true, null)
    })
  },
  push: (href: string, options?: NavigateOptions) => {
    startTransition(() => {
      dispatchNavigateAction(href, 'push', options?.scroll ?? true, null)
    })
  },
  refresh: () => {
    startTransition(() => {
      dispatchAppRouterAction({
        type: ACTION_REFRESH,
        origin: window.location.origin,
      })
    })
  },
  hmrRefresh: () => {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error(
        'hmrRefresh can only be used in development mode. Please use refresh instead.'
      )
    } else {
      startTransition(() => {
        dispatchAppRouterAction({
          type: ACTION_HMR_REFRESH,
          origin: window.location.origin,
        })
      })
    }
  },
}

// Exists for debugging purposes. Don't use in application code.
if (typeof window !== 'undefined' && window.next) {
  window.next.router = publicAppRouterInstance
}
