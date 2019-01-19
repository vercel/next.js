import { delay } from 'redux-saga'
import { call, put, take } from 'redux-saga/effects'
import es6promise from 'es6-promise'
import 'isomorphic-unfetch'

import { actionTypes, tickClock } from './actions'

es6promise.polyfill()

function * runClockSaga () {
  yield take(actionTypes.START_CLOCK)
  while (true) {
    yield put(tickClock(false))
    yield call(delay, 800)
  }
}

export default call(runClockSaga)
