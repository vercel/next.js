import type { Action, ThunkAction } from '@reduxjs/toolkit'
import { configureStore } from '@reduxjs/toolkit'
import { counterSlice } from './features/counter/counterSlice'

export const makeStore = () => {
  return configureStore({
    reducer: {
      [counterSlice.reducerPath]: counterSlice.reducer,
    },
  })
}

// Infer the type of `makeStore`
export type AppStore = ReturnType<typeof makeStore>
// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action
>
