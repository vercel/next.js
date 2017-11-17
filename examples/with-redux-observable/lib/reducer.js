import * as api from './api'
import { Observable } from './rxjs-library'

const FETCH_CHARACTER_SUCCESS = 'FETCH_CHARACTER_SUCCESS'
const FETCH_CHARACTER_FAILURE = 'FETCH_CHARACTER_FAILURE'
const START_FETCHING_CHARACTERS = 'START_FETCHING_CHARACTERS'
const STOP_FETCHING_CHARACTERS = 'STOP_FETCHING_CHARACTERS'

const INITIAL_STATE = {
  nextCharacterId: 1,
  character: {},
  isFetchedOnServer: false,
  error: null
}

export default function reducer (state = INITIAL_STATE, { type, payload }) {
  switch (type) {
    case FETCH_CHARACTER_SUCCESS:
      return {
        ...state,
        character: payload.response,
        isFetchedOnServer: payload.isServer,
        nextCharacterId: state.nextCharacterId + 1
      }
    case FETCH_CHARACTER_FAILURE:
      return { ...state, error: payload.error, isFetchedOnServer: payload.isServer }
    default:
      return state
  }
}

export const startFetchingCharacters = () => ({ type: START_FETCHING_CHARACTERS })
export const stopFetchingCharacters = () => ({ type: STOP_FETCHING_CHARACTERS })

export const fetchUserEpic = (action$, store) =>
  action$.ofType(START_FETCHING_CHARACTERS)
    .mergeMap(
      action => Observable.interval(3000)
        .mergeMap(x => api.fetchCharacter(store.getState().nextCharacterId))
        .takeUntil(action$.ofType(STOP_FETCHING_CHARACTERS))
    )

export const fetchCharacterSuccess = (response, isServer) => ({
  type: FETCH_CHARACTER_SUCCESS,
  payload: { response, isServer }
})

export const fetchCharacterFailure = (error, isServer) => ({
  type: FETCH_CHARACTER_FAILURE,
  payload: { error, isServer }
})
