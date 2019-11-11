import { delay, call, put, take } from 'redux-saga/effects'
import { polyfill } from 'es6-promise'
import 'isomorphic-unfetch'

import { actionTypes, tickClock } from './actions'

polyfill()

function* runClockSaga() {
  yield take(actionTypes.START_CLOCK)
  while (true) {
    yield put(tickClock(false))
    yield delay(800)
  }
}

export default call(runClockSaga)
