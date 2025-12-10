import type { Dispatch } from 'react'
import React, { use, useMemo } from 'react'
import { isThenable } from '../../shared/lib/is-thenable'
import type { AppRouterActionQueue } from './app-router-instance'
import type {
  AppRouterState,
  ReducerActions,
  ReducerState,
} from './router-reducer/router-reducer-types'
import { unresolvedThenable } from './unresolved-thenable'

// The app router state lives outside of React, so we can import the dispatch
// method directly wherever we need it, rather than passing it around via props
// or context.
let dispatch: Dispatch<ReducerActions> | null = null

export function dispatchAppRouterAction(action: ReducerActions) {
  if (dispatch === null) {
    throw new Error(
      'Internal Next.js error: Router action dispatched before initialization.'
    )
  }
  dispatch(action)
}

const __DEV__ = process.env.NODE_ENV !== 'production'
const promisesWithDebugInfo: WeakMap<
  Promise<AppRouterState>,
  Promise<AppRouterState> & { _debugInfo?: Array<unknown> }
> = __DEV__ ? new WeakMap() : (null as any)

export function useActionQueue(
  actionQueue: AppRouterActionQueue
): AppRouterState {
  const [state, setState] = React.useState<ReducerState>(actionQueue.state)

  // Because of a known issue that requires to decode Flight streams inside the
  // render phase, we have to be a bit clever and assign the dispatch method to
  // a module-level variable upon initialization. The useState hook in this
  // module only exists to synchronize state that lives outside of React.
  // Ideally, what we'd do instead is pass the state as a prop to root.render;
  // this is conceptually how we're modeling the app router state, despite the
  // weird implementation details.
  if (process.env.NODE_ENV !== 'production') {
    const { useAppDevRenderingIndicator } =
      require('../../next-devtools/userspace/use-app-dev-rendering-indicator') as typeof import('../../next-devtools/userspace/use-app-dev-rendering-indicator')
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const appDevRenderingIndicator = useAppDevRenderingIndicator()

    dispatch = (action: ReducerActions) => {
      appDevRenderingIndicator(() => {
        actionQueue.dispatch(action, setState)
      })
    }
  } else {
    dispatch = (action: ReducerActions) =>
      actionQueue.dispatch(action, setState)
  }

  // When navigating to a non-prefetched route, then App Router state will be
  // blocked until the server responds. We need to transfer the `_debugInfo`
  // from the underlying Flight response onto the top-level promise that is
  // passed to React (via `use`) so that the latency is accurately represented
  // in the React DevTools.
  const stateWithDebugInfo = useMemo(() => {
    if (!__DEV__) {
      return state
    }

    if (isThenable(state)) {
      // useMemo can't be used to cache a Promise since the memoized value is thrown
      // away when we suspend. So we use a WeakMap to cache the Promise with debug info.
      let promiseWithDebugInfo = promisesWithDebugInfo.get(state)
      if (promiseWithDebugInfo === undefined) {
        const debugInfo: Array<unknown> = []
        promiseWithDebugInfo = Promise.resolve(state).then((asyncState) => {
          if (asyncState.debugInfo !== null) {
            debugInfo.push(...asyncState.debugInfo)
          }
          return asyncState
        }) as Promise<AppRouterState> & { _debugInfo?: Array<unknown> }
        promiseWithDebugInfo._debugInfo = debugInfo

        promisesWithDebugInfo.set(state, promiseWithDebugInfo)
      }

      return promiseWithDebugInfo
    }
    return state
  }, [state])

  const resolvedState = isThenable(stateWithDebugInfo)
    ? use(stateWithDebugInfo)
    : stateWithDebugInfo

  if (resolvedState.suspended !== null) {
    // The router is in a suspended state. Suspend indefinitely to prevent
    // the transition from committing.
    //
    // This happens in cases where a navigation is requested but we don't know
    // (and can't make an informed guess) what the target route will be. So
    // we must wait for the server to respond before updating the router.
    //
    // The reason we suspend is to ensure the navigation is entangled with
    // any React Transition updates that occured within the same scope. For
    // example, optimistic updates should not revent until the router
    // finishes navigating.
    //
    // Note that we're not unwrapping any particular promise here. Instead we
    // rely on a future state update to un-suspend the router. Because all
    // router updates are made to the same state queue, they will always be
    // entangled together. This is the same trick we use to suspend segments
    // when a navigation fails with missing data: indefinitely suspend ->
    // wait for subsequent router update.
    //
    // Semantically this should be identical to unwrapping a promise that
    // resolves to the eventual router state.
    // TODO: To make this more straightforward and less clever, we should
    // literally unwrap a promise that resolves to the next state. Need to
    // refactor the router queue so that dispatching an action doesn't always
    // produce a new React update. Will wait for the remaining reducers to
    // be rewritten first.
    use(unresolvedThenable) as never
  }

  return resolvedState
}
