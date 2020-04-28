import * as React from 'react'
import * as Bus from './bus'
import { ShadowPortal } from './components/ShadowPortal'
import { Errors, SupportedErrorEvents } from './container/Errors'
import { Base } from './styles/Base'
import { ComponentStyles } from './styles/ComponentStyles'
import { CssReset } from './styles/CssReset'

type BusState = {
  errors: SupportedErrorEvents[]
}

function reducer(state: BusState, ev: Bus.BusEvent): BusState {
  switch (ev.type) {
    case Bus.TYPE_UNHANDLED_ERROR:
    case Bus.TYPE_UNHANDLED_REJECTION: {
      return { ...state, errors: [...state.errors, ev] }
    }
    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _: never = ev
      return state
    }
  }
}

function ReactDevOverlay({ children }) {
  const [state, dispatch] = React.useReducer(reducer, { errors: [] })
  React.useEffect(() => {
    Bus.on(dispatch)
    return function() {
      Bus.off(dispatch)
    }
  }, [dispatch])

  if (state.errors.length) {
    return (
      <React.Fragment>
        {children}

        <ShadowPortal>
          <CssReset />
          <Base />
          <ComponentStyles />

          <Errors errors={state.errors} />
        </ShadowPortal>
      </React.Fragment>
    )
  }
  return children
}

export default ReactDevOverlay
