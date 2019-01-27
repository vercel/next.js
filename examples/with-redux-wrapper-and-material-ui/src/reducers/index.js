import { INCREMENT, DECREMENT } from '../constants'

const initialState = {
  value: 0,
  action: null,
  from: null
}

export const counter = (state = initialState, action) => {
  switch (action.type) {
    case INCREMENT:
      return {
        ...state,
        value: state.value + 1,
        action: 'increment',
        from: action.from
      }

    case DECREMENT:
      return {
        ...state,
        value: state.value - 1,
        action: 'decrement',
        from: action.from
      }

    default:
      return state
  }
}
