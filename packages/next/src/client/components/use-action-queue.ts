import type { Dispatch } from 'react'
import React, { startTransition, use } from 'react'
import { isThenable } from '../../shared/lib/is-thenable'
import type { AppRouterActionQueue } from './app-router-instance'
import type {
  AppRouterState,
  ReducerActions,
  ReducerState,
} from './router-reducer/router-reducer-types'

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

  if (process.env.NODE_ENV !== 'production') {
    // In development, set an pending state on the DevTools indicator
    // whenever a router action is in progress. This is backed by useOptimistic,
    // so we don't need to set it back to false; it will be automatically reset
    // when the transition completes.
    const setDevRenderIndicatorPending =
      require('./react-dev-overlay/utils/dev-indicator/dev-render-indicator')
        .setDevRenderIndicatorPending as typeof import('./react-dev-overlay/utils/dev-indicator/dev-render-indicator').setDevRenderIndicatorPending
    startTransition(() => setDevRenderIndicatorPending())
  }

  // NOTE: This is wrapped in a startTransition internally, but to avoid a
  // refactor hazard we should consider wrapping it here instead.
  dispatch(action)
}

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
  dispatch = (action: ReducerActions) => actionQueue.dispatch(action, setState)

  return isThenable(state) ? use(state) : state
}
