import { createStore } from 'redux'
import { IS_SERVER } from './exenv'
import getReducer from './reducer'
import createMiddleware from './middleware'

export const initStore = (client, initialState) => {
  let store
  if (IS_SERVER || !window.REDUX_STORE) {
    const middleware = createMiddleware(client.middleware())
    store = createStore(getReducer(client), initialState, middleware)
    if (IS_SERVER) {
      return store
    }
    window.REDUX_STORE = store
  }
  return window.REDUX_STORE
}
