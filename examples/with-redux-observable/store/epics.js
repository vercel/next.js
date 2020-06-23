import { interval, of } from 'rxjs'
import { takeUntil, mergeMap, catchError, map } from 'rxjs/operators'
import { combineEpics, ofType } from 'redux-observable'
import { request } from 'universal-rxjs-ajax' // because standard AjaxObservable only works in browser

import * as actions from './actions'
import * as types from './actionTypes'

export const fetchUsersEpic = (action$, state$) =>
  action$.pipe(
    ofType(types.START_FETCHING_USERS),
    mergeMap((action) => {
      return interval(5000).pipe(
        map((x) => actions.fetchUser()),
        takeUntil(
          action$.ofType(types.STOP_FETCHING_USERS, types.FETCH_USER_FAILURE)
        )
      )
    })
  )

export const fetchUserEpic = (action$, state$) =>
  action$.pipe(
    ofType(types.FETCH_USER),
    mergeMap((action) =>
      request({
        url: `https://jsonplaceholder.typicode.com/users/${state$.value.nextUserId}`,
      }).pipe(
        map((response) =>
          actions.fetchUserSuccess(response.response, action.payload.isServer)
        ),
        catchError((error) =>
          of(
            actions.fetchUserFailure(
              error.xhr.response,
              action.payload.isServer
            )
          )
        )
      )
    )
  )

export const rootEpic = combineEpics(fetchUsersEpic, fetchUserEpic)
