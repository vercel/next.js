import thunkMiddleware from 'redux-thunk'
import { createStore, applyMiddleware, compose } from 'redux'
import { createLogger } from 'redux-logger'
import reducer, { initialState } from 'reducers'

export const initStore = (initialState = initialState) => {
  const middlewares = [thunkMiddleware, createLogger()]
  return createStore(
    reducer,
    initialState,
    compose(applyMiddleware(...middlewares))
  )
}