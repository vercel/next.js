import {call, put, take} from 'redux-saga/effects';
import {actionTypes} from '../actions/api-actions';

export function* apiCheck() {
    try {
        while (true) {
            yield take(actionTypes.FETCH_API_CHECK);

            const response = yield call(fetch, '/api/check', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            const data = yield call([response, response.json]);
            yield put({type: actionTypes.FETCH_API_CHECK_SUCCESS, data});
        }
    } catch (error) {
        yield put({type: actionTypes.FETCH_API_CHECK_FAIL, error});
    }
}
