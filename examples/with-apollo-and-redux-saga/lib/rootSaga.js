import { all } from 'redux-saga/effects'
import 'isomorphic-unfetch'
import clockSaga from './clock/sagas'
import placeholderSaga from './placeholder/sagas'

function * rootSaga () {
  yield all([clockSaga, placeholderSaga])
}

export default rootSaga
