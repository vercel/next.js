import { getDataUsers } from './actions'

const initialState = {
  loading: false,
  loadend: false,
  error: null,
  users: []
}

function exampleReducer (state = initialState, { type, payload }) {
  switch (type) {
    case getDataUsers.REQUEST:
      return { ...state, loading: true }

    case getDataUsers.SUCCESS:
      return { ...state, loading: false, loadend: true, users: payload }

    case getDataUsers.FAILURE:
      return { ...state, loading: false, loadend: false, error: payload }

    default:
      return state
  }
}

export default exampleReducer
