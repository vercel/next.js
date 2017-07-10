import thunkMiddleware from 'redux-thunk'
import { createStore, applyMiddleware, compose } from 'redux'
import { createLogger } from 'redux-logger'
import reducer, { initialState } from 'reducers'

export default (state = initialState) => {
  const middlewares = [thunkMiddleware, createLogger()]
  return createStore(
    reducer,
    state,
    compose(applyMiddleware(...middlewares))
  )
}
