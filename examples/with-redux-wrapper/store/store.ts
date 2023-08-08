import { Store, configureStore } from '@reduxjs/toolkit'
import { createWrapper } from 'next-redux-wrapper'
import counter from './counterSlice'
import tick from './tickSlice'

const initStore = () => {
  return configureStore({
    reducer: {
      counter,
      tick,
    },
  })
}

export const wrapper = createWrapper<Store<RootState>>(initStore)

export type RootState = ReturnType<ReturnType<typeof initStore>['getState']>
export type AppStore = ReturnType<typeof initStore>
export type AppState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
