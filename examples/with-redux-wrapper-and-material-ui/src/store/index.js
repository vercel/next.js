import { createStore, applyMiddleware } from 'redux'
import { composeWithDevTools } from 'redux-devtools-extension'
import thunk from 'redux-thunk'
import { counter } from '../reducers'

const store = initialState => {
  return createStore(
    counter,
    initialState,
    composeWithDevTools(applyMiddleware(thunk))
  )
}

export default store
