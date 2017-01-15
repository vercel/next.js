import { createStore } from 'redux'
import { IS_SERVER } from './exenv'
import getReducer from './reducer'
import createMiddleware from './middleware'

export const initStore = (client, initialState) => {
  let store
  if (IS_SERVER || !window.store) {
    const middleware = createMiddleware(client.middleware())
    store = createStore(getReducer(client), initialState, middleware)
    if (IS_SERVER) {
      return store
    }
    window.store = store
  }
  return window.store
}
