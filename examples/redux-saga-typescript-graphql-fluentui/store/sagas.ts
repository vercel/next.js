import { all, fork } from 'redux-saga/effects'
import { watchSearchAddress } from './search/sagas'

function* rootSaga() {
  yield all([fork(watchSearchAddress)])
}

export default rootSaga
