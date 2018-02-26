import { actionTypes } from './actions'

const initialState = 0

function reducer(state = initialState, action) {
  switch (action.type) {
    case actionTypes.COUNT_INCREASE:
      return state + 1

    case actionTypes.COUNT_DECREASE:
      return state - 1

    default:
      return state
  }
}

export default reducer
