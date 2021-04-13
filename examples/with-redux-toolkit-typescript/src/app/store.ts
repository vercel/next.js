import { configureStore, ThunkAction, Action } from '@reduxjs/toolkit'

import clockReducer from '../features/clock/clockSlice'
import counterReducer from '../features/counter/counterSlice'
import notesReducer from '../features/note/notesSlice'

export function makeStore() {
  return configureStore({
    reducer: {
      clock: clockReducer,
      counter: counterReducer,
      notes: notesReducer,
    },
  })
}

const store = makeStore()

export type AppState = ReturnType<typeof store.getState>

export type AppDispatch = typeof store.dispatch

export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  AppState,
  unknown,
  Action<string>
>

export default store
