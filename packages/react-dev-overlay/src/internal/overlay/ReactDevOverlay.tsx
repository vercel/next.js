import * as React from 'react'
import * as Bus from '../bus'
import { StackFrame } from './StackFrame'

type BusState = {
  runtimeErrors: { error: Error; frames: StackFrame[] }[]
}
function reducer(state: BusState, ev: Bus.BusEvent): BusState {
  switch (ev.type) {
    case Bus.TYPE_UNHANDLED_ERROR:
    case Bus.TYPE_UNHANDLED_REJECTION: {
      return {
        ...state,
        runtimeErrors: [
          ...state.runtimeErrors,
          { error: ev.reason, frames: ev.frames },
        ],
      }
    }
    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _: never = ev
      return state
    }
  }
}

function ReactDevOverlay({ children }) {
  const [state, dispatch] = React.useReducer(reducer, { runtimeErrors: [] })
  React.useEffect(() => {
    Bus.on(dispatch)
    return function() {
      Bus.off(dispatch)
    }
  }, [dispatch])

  console.log(state)
  return children
}

export default ReactDevOverlay
