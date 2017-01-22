import { createStore } from 'redux'
import getReducer from './reducer'
import createMiddleware from './middleware'

export const initStore = (client, initialState) => {
  let store
  if (!process.browser || !window.REDUX_STORE) {
    const middleware = createMiddleware(client.middleware())
    store = createStore(getReducer(client), initialState, middleware)
    if (!process.browser) {
      return store
    }
    window.REDUX_STORE = store
  }
  return window.REDUX_STORE
}
