import { combineEpics, ofType } from "redux-observable";
import { of, timer } from "rxjs";
import {
  switchMap,
  map,
  catchError,
  takeUntil,
  mergeMap,
} from "rxjs/operators";
import { ajax } from "rxjs/ajax";
import * as types from "./actionTypes";
import {
  fetchCharacter,
  fetchCharacterSuccess,
  fetchCharacterFailure,
} from "./actions";

const SWAPI_BASE = "https://swapi.dev/api/people/";

// Epic that fetches a single character by ID
const fetchCharacterEpic = (action$: any) =>
  action$.pipe(
    ofType(types.FETCH_CHARACTER),
    switchMap((action: any) =>
      ajax.getJSON(`${SWAPI_BASE}${action.payload}/`).pipe(
        map((response: any) => fetchCharacterSuccess(response)),
        catchError((error) => of(fetchCharacterFailure(error)))
      )
    )
  );

// Epic that periodically fetches a new random character every 3 seconds
const startFetchingCharactersEpic = (action$: any) =>
  action$.pipe(
    ofType(types.START_FETCHING_CHARACTERS),
    switchMap(() =>
      timer(0, 3000).pipe(
        takeUntil(action$.pipe(ofType(types.STOP_FETCHING_CHARACTERS))),
        map(() => {
          const id = Math.floor(Math.random() * 82) + 1;
          return fetchCharacter(id);
        })
      )
    )
  );

export const rootEpic = combineEpics(
  fetchCharacterEpic,
  startFetchingCharactersEpic
);
