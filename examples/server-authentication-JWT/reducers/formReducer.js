import { INPUT_VALUE, LOGGED_IN } from '../constants'

const initialState = {}

export default (state = initialState, action) => {
  switch (action.type) {
    case INPUT_VALUE:
      return { ...state,
        [action.title]:
        { ...state[action.title],
          [action.name]: action.val
        }
      }
    case LOGGED_IN:
      return initialState
    default:
      return state
  }
}
