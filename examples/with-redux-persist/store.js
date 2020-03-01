import { createStore, applyMiddleware } from 'redux'
import { composeWithDevTools } from 'redux-devtools-extension'
import { persistReducer } from 'redux-persist'
import storage from 'redux-persist/lib/storage'

const exampleInitialState = {
  lastUpdate: 0,
  light: false,
  count: 0,
  exampleData: [],
  error: null,
}

export const actionTypes = {
  TICK: 'TICK',
  INCREMENT: 'INCREMENT',
  DECREMENT: 'DECREMENT',
  RESET: 'RESET',
  LOAD_EXAMPLE_DATA: 'LOAD_EXAMPLE_DATA',
  LOADING_DATA_FAILURE: 'LOADING_DATA_FAILURE',
}

// REDUCERS
export const reducer = (state = exampleInitialState, action) => {
  switch (action.type) {
    case actionTypes.TICK:
      return Object.assign({}, state, {
        lastUpdate: action.ts,
        light: !!action.light,
      })
    case actionTypes.INCREMENT:
      return Object.assign({}, state, {
        count: state.count + 1,
      })
    case actionTypes.DECREMENT:
      return Object.assign({}, state, {
        count: state.count - 1,
      })
    case actionTypes.RESET:
      return Object.assign({}, state, {
        count: exampleInitialState.count,
      })
    case actionTypes.LOAD_EXAMPLE_DATA:
      return Object.assign({}, state, {
        exampleData: action.data,
      })
    case actionTypes.LOADING_DATA_FAILURE:
      return Object.assign({}, state, {
        error: true,
      })
    default:
      return state
  }
}

// ACTIONS
export const serverRenderClock = () => {
  return { type: actionTypes.TICK, light: false, ts: Date.now() }
}
export const startClock = () => {
  return { type: actionTypes.TICK, light: true, ts: Date.now() }
}

export const incrementCount = () => {
  return { type: actionTypes.INCREMENT }
}

export const decrementCount = () => {
  return { type: actionTypes.DECREMENT }
}

export const resetCount = () => {
  return { type: actionTypes.RESET }
}

export const loadExampleData = data => {
  return { type: actionTypes.LOAD_EXAMPLE_DATA, data }
}

export const loadingExampleDataFailure = () => {
  return { type: actionTypes.LOADING_DATA_FAILURE }
}

const persistConfig = {
  key: 'primary',
  storage,
  whitelist: ['exampleData'], // place to select which state you want to persist
}

const persistedReducer = persistReducer(persistConfig, reducer)

export function initializeStore(initialState = exampleInitialState) {
  return createStore(
    persistedReducer,
    initialState,
    composeWithDevTools(applyMiddleware())
  )
}
