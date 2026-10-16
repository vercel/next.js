import * as types from "./actionTypes";

export const fetchCharacter = (id: number) => ({
  type: types.FETCH_CHARACTER,
  payload: id,
});

export const fetchCharacterSuccess = (response: any) => ({
  type: types.FETCH_CHARACTER_SUCCESS,
  payload: response,
});

export const fetchCharacterFailure = (error: Error) => ({
  type: types.FETCH_CHARACTER_FAILURE,
  payload: error.message,
});

export const startFetchingCharacters = () => ({
  type: types.START_FETCHING_CHARACTERS,
});

export const stopFetchingCharacters = () => ({
  type: types.STOP_FETCHING_CHARACTERS,
});
