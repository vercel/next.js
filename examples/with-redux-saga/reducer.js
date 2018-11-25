import {actionTypes} from './actions'

export const exampleInitialState = {
  count: 0,
  error: false,
  lastUpdate: 0,
  light: false,
  placeholderData: null
}

function reducer (state = exampleInitialState, action) {
  switch (action.type) {
    case actionTypes.FAILURE:
      return {
        ...state,
        ...{error: action.error}
      }

    case actionTypes.INCREMENT:
      return {
        ...state,
        ...{count: state.count + 1}
      }

    case actionTypes.DECREMENT:
      return {
        ...state,
        ...{count: state.count - 1}
      }

    case actionTypes.RESET:
      return {
        ...state,
        ...{count: exampleInitialState.count}
      }

    case actionTypes.LOAD_DATA_SUCCESS:
      return {
        ...state,
        ...{placeholderData: action.data}
      }

    case actionTypes.TICK_CLOCK:
      return {
        ...state,
        ...{lastUpdate: action.ts, light: !!action.light}
      }

    default:
      return state
  }
}

export default reducer
