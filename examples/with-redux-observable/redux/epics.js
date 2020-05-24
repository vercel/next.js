import { interval, of } from 'rxjs'
import { takeUntil, mergeMap, catchError, map } from 'rxjs/operators'
import { combineEpics, ofType } from 'redux-observable'
import { request } from 'universal-rxjs-ajax' // because standard AjaxObservable only works in browser

import * as actions from './actions'
import * as types from './actionTypes'

export const fetchUserEpic = (action$, state$) =>
  action$.pipe(
    ofType(types.START_FETCHING_CHARACTERS),
    mergeMap(action => {
      return interval(3000).pipe(
        map(x => actions.fetchCharacter()),
        takeUntil(
          action$.ofType(
            types.STOP_FETCHING_CHARACTERS,
            types.FETCH_CHARACTER_FAILURE
          )
        )
      )
    })
  )

export const fetchCharacterEpic = (action$, state$) =>
  action$.pipe(
    ofType(types.FETCH_CHARACTER),
    mergeMap(action =>
      request({
        url: `https://swapi.co/api/people/${state$.value.nextCharacterId}`,
      }).pipe(
        map(response =>
          actions.fetchCharacterSuccess(
            response.response,
            action.payload.isServer
          )
        ),
        catchError(error =>
          of(
            actions.fetchCharacterFailure(
              error.xhr.response,
              action.payload.isServer
            )
          )
        )
      )
    )
  )

export const rootEpic = combineEpics(fetchUserEpic, fetchCharacterEpic)
