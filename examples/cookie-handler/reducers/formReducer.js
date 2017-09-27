import { INPUT_VALUE, CREATED_NAME } from '../constants'

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
    case CREATED_NAME:
      return initialState
    default:
      return state
  }
}
