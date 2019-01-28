import 'isomorphic-fetch'
import { takeLatest, put, call } from 'redux-saga/effects'

import { getDataUsers } from './actions'

export function getDataApi () {
  // eslint-disable-next-line
  return fetch("https://reqres.in/api/users").then(response => {
    return response.json()
  })
}

export function * getDataRequest () {
  try {
    yield put(getDataUsers.request())

    const data = yield call(getDataApi, {})

    yield put(getDataUsers.success(data))
  } catch (err) {
    yield put(getDataUsers.failure(err))
  } finally {
    yield put(getDataUsers.fulfill())
  }
}

export default function * dataExample () {
  yield takeLatest(getDataUsers.TRIGGER, getDataRequest)
}
