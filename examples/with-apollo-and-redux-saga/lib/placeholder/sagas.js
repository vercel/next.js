import { put, takeLatest } from 'redux-saga/effects'
import es6promise from 'es6-promise'
import 'isomorphic-unfetch'

import { actionTypes, loadDataSuccess, loadDataError } from './actions'

es6promise.polyfill()

function* loadDataSaga() {
  try {
    const res = yield fetch('https://jsonplaceholder.typicode.com/users')
    const data = yield res.json()
    yield put(loadDataSuccess(data))
  } catch (err) {
    yield put(loadDataError(err))
  }
}

export default takeLatest(actionTypes.LOAD_DATA, loadDataSaga)
