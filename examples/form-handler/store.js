import { createStore, applyMiddleware } from 'redux'
import thunkMiddleware from 'redux-thunk'
import reducer from './reducers'

export const initStore = (initialState = {}) => {
  return createStore(reducer, initialState, applyMiddleware(thunkMiddleware))
}
