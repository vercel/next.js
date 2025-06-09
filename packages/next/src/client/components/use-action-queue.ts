import type { Dispatch } from 'react'
import React, { use } from 'react'
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
  if (process.env.NODE_ENV !== 'production') {
    const { useAppDevRenderingIndicator } =
      require('./react-dev-overlay/utils/dev-indicator/use-app-dev-rendering-indicator') as typeof import('./react-dev-overlay/utils/dev-indicator/use-app-dev-rendering-indicator')
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

  return isThenable(state) ? use(state) : state
}
