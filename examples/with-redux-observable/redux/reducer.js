import * as types from './actionTypes'

const INITIAL_STATE = {
  nextCharacterId: 1,
  character: {},
  isFetchedOnServer: false,
  error: null
}

export default function reducer (state = INITIAL_STATE, { type, payload }) {
  switch (type) {
    case types.FETCH_CHARACTER_SUCCESS:
      return {
        ...state,
        character: payload.response,
        isFetchedOnServer: payload.isServer,
        nextCharacterId: state.nextCharacterId + 1
      }
    case types.FETCH_CHARACTER_FAILURE:
      return { ...state, error: payload.error, isFetchedOnServer: payload.isServer }
    default:
      return state
  }
}
