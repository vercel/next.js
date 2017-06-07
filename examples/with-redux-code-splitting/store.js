import { createStore } from './hocs/withRedux'
import { applyMiddleware } from 'redux'
import thunkMiddleware from 'redux-thunk'
import { reducer as globalCounter } from './components/GlobalCounter'
import { reducer as globalClock } from './components/Clock'

const globalReducers = {
  globalCounter,
  globalClock
}

export const initStore = (initialState, localReducers) => {
  // ATTENTION: We need to use the patched createStore
  // function from the withRedux file.
  return createStore(
    globalReducers,
    initialState,
    applyMiddleware(thunkMiddleware),
    localReducers
  )
}
