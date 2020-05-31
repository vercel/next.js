import * as types from './actionTypes'

export const startFetchingUsers = () => ({
  type: types.START_FETCHING_CHARACTERS,
})
export const stopFetchingUsers = () => ({
  type: types.STOP_FETCHING_CHARACTERS,
})
export const fetchUser = (isServer = false) => ({
  type: types.FETCH_CHARACTER,
  payload: { isServer },
})
export const fetchUserSuccess = (response, isServer) => ({
  type: types.FETCH_CHARACTER_SUCCESS,
  payload: { response, isServer },
})

export const fetchUserFailure = (error, isServer) => ({
  type: types.FETCH_CHARACTER_FAILURE,
  payload: { error, isServer },
})
