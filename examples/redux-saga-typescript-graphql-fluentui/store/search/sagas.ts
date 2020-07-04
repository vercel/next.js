import { call, debounce, put } from 'redux-saga/effects'
import { SagaSetting } from '../../constants'
import { searchAddressAPI } from './api'
import {
  Address,
  SearchAddressActionTypes,
  SearchAddressFailurePayload,
  SearchAddressActions,
  SearchAddressSuccessPayload,
  SearchAddressPayload,
} from './actions'

function* executeSearchAddress(action: SearchAddressActionTypes) {
  const fetchPayload = action.payload as SearchAddressPayload

  try {
    // call api
    const fetchResult: Address[] = yield call(searchAddressAPI, fetchPayload)

    // Pack the fetch result into a redux successful action,
    // and the caller gets the result from there
    const successPayload: SearchAddressSuccessPayload = {
      addresses: fetchResult,
    }
    yield put({
      type: SearchAddressActions.searchAddressSuccess.toString(),
      payload: successPayload,
    })
  } catch (e) {
    console.error(e)

    // Pack exception error object into failure action, caller gets it
    const failurePayload: SearchAddressFailurePayload = {
      error: e,
    }
    yield put({
      type: SearchAddressActions.searchAddressFailure.toString(),
      payload: failurePayload,
    })
  }
}

export const watchSearchAddress = function* () {
  yield debounce(
    SagaSetting.DEBOUNCE_INTERVAL,
    SearchAddressActions.searchAddress,
    executeSearchAddress
  )
}
