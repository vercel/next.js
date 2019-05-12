import {createStore, applyMiddleware, combineReducers} from 'redux';
import {composeWithDevTools} from 'redux-devtools-extension';
import thunkMiddleware from 'redux-thunk';
import {dbReducer} from "./reducers/db-reducers";
import logger from 'redux-logger';
import createSagaMiddleware from 'redux-saga';
import rootSaga from './sagas/root-saga';
import {s3Reducer} from "./reducers/s3-reducers";
import {apiReducer} from "./reducers/api-reducers";

const reducer = combineReducers({
    dbclient: dbReducer,
    s3client: s3Reducer,
    apiclient: apiReducer
});

export function initializeStore() {
    const sagaMiddleware = createSagaMiddleware();

    const store = createStore(
        reducer,
        composeWithDevTools(
            applyMiddleware(
                thunkMiddleware,
                sagaMiddleware,
                logger
            )
        )
    );
    store.sagaTask = sagaMiddleware.run(rootSaga);

    return store
}

