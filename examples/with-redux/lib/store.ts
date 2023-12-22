import type { Action, ThunkAction } from '@reduxjs/toolkit'
import { configureStore } from '@reduxjs/toolkit'
import { counterSlice } from './features/counter/counterSlice'
import { quotesApiSlice } from './features/quotes/quotesApiSlice'

export const makeStore = () => {
  return configureStore({
    reducer: {
      [counterSlice.reducerPath]: counterSlice.reducer,
      [quotesApiSlice.reducerPath]: quotesApiSlice.reducer,
    },
    // Adding the api middleware enables caching, invalidation, polling,
    // and other useful features of `rtk-query`.
    middleware: (getDefaultMiddleware) => {
      return getDefaultMiddleware().concat(quotesApiSlice.middleware)
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
