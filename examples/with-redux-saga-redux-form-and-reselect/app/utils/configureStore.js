import createSagaMiddleware from 'redux-saga';
import { createStore, applyMiddleware, compose } from 'redux';
import { routinePromiseWatcherSaga } from 'redux-saga-routines';

import createReducer from './createReducer';

const sagaMiddleware = createSagaMiddleware();

export default function configureStore(initialState = {}) {
    const middlewares = [sagaMiddleware];

    const enhancers = [applyMiddleware(...middlewares)];

    const composeEnhancers =
        process.env.NODE_ENV !== 'production' &&
            typeof window === 'object' &&
            window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
            ? window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__({
                shouldHotReload: false,
            })
            : compose;

    const store = createStore(
        createReducer(),
        initialState,
        composeEnhancers(...enhancers)
    );

    store.runSaga = sagaMiddleware.run;
    store.injectedReducers = {};
    store.injectedSagas = {};

    store.runSaga(routinePromiseWatcherSaga);

    if (module.hot) {
        module.hot.accept('./createReducer', () => {
            store.replaceReducer(createReducer(store.injectedReducers));
        });
    }

    return store;
}
