import { configureStore } from '@reduxjs/toolkit'

import clockReducer from './lib/slices/clockSlice'
import counterReducer from './lib/slices/counterSlice'

export default configureStore({
  reducer: {
    counter: counterReducer,
    clock: clockReducer,
  },
  devTools: true,
})
