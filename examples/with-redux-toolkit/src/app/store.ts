import { combineReducers, configureStore } from '@reduxjs/toolkit'
import counterReducer from '../features/counter/counterSlice'

const rootReducer = combineReducers({
  counter: counterReducer,
})

export type CoreState = ReturnType<typeof rootReducer>

export const store = configureStore({
  reducer: rootReducer,
})
