import type { AppRouterState } from './router-reducer/router-reducer-types'
import { startTransition, use, useState } from 'react'
import { isThenable } from '../../shared/lib/is-thenable'

// The app router state lives outside of React, so we can import the dispatch
// method directly wherever we need it, rather than passing it around via props
// or context.
let setState: ((state: PromiseLike<AppRouterState>) => void) | null = null

export function setAppRouterState(state: PromiseLike<AppRouterState>) {
  startTransition(() => {
    if (setState === null) {
      throw new Error(
        'Internal Next.js error: Router action dispatched before initialization.'
      )
    }
    setState(state)
  })
}

export function useActionQueue(initialState: AppRouterState): AppRouterState {
  const [state, _setState] = useState<
    AppRouterState | PromiseLike<AppRouterState>
  >(initialState)

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

    setState = (newState: PromiseLike<AppRouterState>) => {
      appDevRenderingIndicator(() => {
        _setState(newState)
      })
    }
  } else {
    setState = _setState
  }

  return isThenable(state) ? use(state) : state
}
