import { applyMiddleware, createStore, Store, Middleware } from 'redux'
import createSagaMiddleware, { Task } from 'redux-saga'
import { createWrapper, MakeStore, Context } from 'next-redux-wrapper'

import { combinedReducers, RootState } from './reducers'

import rootSaga from './sagas'

export interface SagaStore extends Store {
  sagaTask?: Task
}

const bindMiddleware = (middleware: [Middleware]) => {
  if (process.env.NODE_ENV !== 'production') {
    const { logger } = require(`redux-logger`)
    middleware.push(logger)

    const { composeWithDevTools } = require('redux-devtools-extension')
    return composeWithDevTools(applyMiddleware(...middleware))
  }

  return applyMiddleware(...middleware)
}

export const makeStore: MakeStore<RootState> = (context: Context) => {
  const sagaMiddleware = createSagaMiddleware()
  const store = createStore(combinedReducers, bindMiddleware([sagaMiddleware]))

  ;(store as SagaStore).sagaTask = sagaMiddleware.run(rootSaga)

  return store
}

export const wrapper = createWrapper(makeStore, { debug: true })
