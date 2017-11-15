import { CREATED_NAME } from '../constants'

const initialState = {
  name: null
}

export default (state = initialState, action) => {
  switch (action.type) {
    case CREATED_NAME:
      return Object.assign({}, state, {name: action.name})
    default:
      return state
  }
}
