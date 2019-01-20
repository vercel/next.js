import { takeLatest, put, call } from 'redux-saga/effects';

import { getDataGraphs } from './actions';

export function getDataApi() {
    return fetch('https://pokeapi.co/api/v2/pokemon/ditto/')
    .then( (response) => {
        return response.json();
    })
}

export function* getDataRequest() {
    try {
        yield put(getDataGraphs.request());

        const data = yield call(getDataApi, {})

        yield put(getDataGraphs.success(data));
    } catch (err) {
        yield put(getDataGraphs.failure(err));
    } finally {
        yield put(getDataGraphs.fulfill());
    }
}

export default function* dataExample() {
    yield takeLatest(getDataGraphs.TRIGGER, getDataRequest);
}
