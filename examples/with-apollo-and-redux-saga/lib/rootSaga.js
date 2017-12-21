import { all } from 'redux-saga/effects'

import clock from './clock/sagas'
import placeholder from './placeholder/sagas'

function* rootSaga() {
  yield all([clock, placeholder])
}

export default rootSaga
