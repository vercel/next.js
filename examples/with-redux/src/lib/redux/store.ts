/* Core */
import { configureStore, type ThunkAction, type Action } from '@reduxjs/toolkit'
import {
  useSelector as useReduxSelector,
  useDispatch as useReduxDispatch,
  TypedUseSelectorHook,
} from 'react-redux'

/* Instruments */
import { reducer } from './rootReducer'
import { middleware } from './middleware'

export const store = configureStore({ reducer, middleware })
export const useDispatch = () => useReduxDispatch<Dispatch>()
export const useSelector: TypedUseSelectorHook<ReduxState> = useReduxSelector

/* Types */
export type Store = typeof store
export type ReduxState = ReturnType<typeof store.getState>
export type Dispatch = typeof store.dispatch
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  ReduxState,
  unknown,
  Action
>
