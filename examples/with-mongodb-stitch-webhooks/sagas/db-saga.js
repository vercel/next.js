import { put, call, take } from 'redux-saga/effects';
import {fetchPostsEndpoint} from "../stitch-webhooks/index";

export function* fetchPosts() {
    try {
        while(true) {
            yield take('GET_USERS');
            const response = yield call(fetchPostsEndpoint);
            const data = yield call([response, response.json]);
            yield put({type: 'GET_USERS_SUCCESS', data});
        }
    } catch (e) {
        yield put({type: 'API_FAIL'});
    }
}

