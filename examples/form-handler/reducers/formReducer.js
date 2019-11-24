import { INPUT_VALUE } from '../constants'

export default (state = {}, action) => {
  switch (action.type) {
    case INPUT_VALUE:
      return {
        ...state,
        [action.title]: { ...state[action.title], [action.name]: action.val },
      }
    default:
      return state
  }
}
