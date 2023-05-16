/* Core */
import { configureStore, ThunkAction, Action } from '@reduxjs/toolkit'

/* Instruments */
import { counterSlice } from './counterSlice'

export const makeStore = () => {
  return configureStore({
    reducer: { counter: counterSlice.reducer },
  })
}

export const store = makeStore()

/* Types */
export type AppState = ReturnType<typeof store.getState>

export type AppDispatch = typeof store.dispatch

export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  AppState,
  unknown,
  Action<string>
>
