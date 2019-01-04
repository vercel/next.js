import { keaReducer } from 'kea'
import { createStore, compose, combineReducers } from 'redux'

const reducers = combineReducers({
  kea: keaReducer('kea')
})

const reduxDevTools =
  typeof window !== 'undefined' && window.__REDUX_DEVTOOLS_EXTENSION__
    ? window.__REDUX_DEVTOOLS_EXTENSION__()
    : f => f

export const initStore = () => {
  return createStore(reducers, compose(reduxDevTools))
}
