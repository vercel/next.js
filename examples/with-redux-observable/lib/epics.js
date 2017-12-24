import * as api from './api'
import { interval } from 'rxjs/observable/interval'
import { takeUntil, map, mergeMap } from 'rxjs/operators'
import * as types from "./actionTypes"

export const fetchUserEpic = (action$, store) =>
  action$.ofType(types.START_FETCHING_CHARACTERS)
    .mergeMap(
      action => interval(3000).pipe(
        mergeMap(x => api.fetchCharacter(store.getState().nextCharacterId)),
        takeUntil(action$.ofType(types.STOP_FETCHING_CHARACTERS))
      )
    )

