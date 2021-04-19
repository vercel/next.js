import { combineReducers, configureStore } from '@reduxjs/toolkit'

import clockReducer from '../lib/slices/clockSlice'
import counterReducer from '../lib/slices/counterSlice'
import notesReducer from '../lib/slices/notesSlice'

const rootReducer = combineReducers({
  counter: counterReducer,
  clock: clockReducer,
  notes: notesReducer,
})

export type CoreState = ReturnType<typeof rootReducer>

export default configureStore({
  reducer: rootReducer,
  devTools: true,
})
