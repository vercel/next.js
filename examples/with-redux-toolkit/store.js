import { configureStore, createReducer } from '@reduxjs/toolkit'

const initialState = {
  light: false,
  lastUpdate: 0,
  count: 0,
}

const reducer = createReducer(initialState, {
  TICK: (state, action) => ({
    ...state,
    lastUpdate: action.payload.lastUpdate,
    light: !!action.light,
  }),
  INCREMENT: (state, action) => ({ ...state, count: state.count + 1 }),
  DECREMENT: (state, action) => ({ ...state, count: state.count - 1 }),
  RESET: (state, action) => ({ ...state, count: initialState.count }),
})

const initializeStore = (preloadedState = initialState) => {
  return configureStore({
    reducer,
    preloadedState,
  })
}
export const store = initializeStore()
