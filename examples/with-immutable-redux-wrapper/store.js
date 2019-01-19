import { createStore, applyMiddleware } from 'redux'
import { composeWithDevTools } from 'redux-devtools-extension'
import thunkMiddleware from 'redux-thunk'
import { fromJS } from 'immutable'

const exampleInitialState = fromJS({
  lastUpdate: 0,
  light: false,
  count: 0
})

export const actionTypes = {
  ADD: 'ADD',
  TICK: 'TICK'
}

// REDUCERS
export const reducer = (state = exampleInitialState, action) => {
  switch (action.type) {
    case actionTypes.TICK:
      return state.merge({
        lastUpdate: action.ts,
        light: !!action.light
      })

    case actionTypes.ADD:
      return state.merge({
        count: state.get('count') + 1
      })

    default:
      return state
  }
}

// ACTIONS
export const serverRenderClock = isServer => dispatch => {
  return dispatch({ type: actionTypes.TICK, light: !isServer, ts: Date.now() })
}

export const startClock = () => dispatch => {
  return setInterval(
    () => dispatch({ type: actionTypes.TICK, light: true, ts: Date.now() }),
    1000
  )
}

export const addCount = () => dispatch => {
  return dispatch({ type: actionTypes.ADD })
}

export const makeStore = (initialState = exampleInitialState) => {
  return createStore(
    reducer,
    initialState,
    composeWithDevTools(applyMiddleware(thunkMiddleware))
  )
}
