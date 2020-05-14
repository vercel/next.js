import { configureStore } from '@reduxjs/toolkit';

import clockReducer from './lib/slices/clockSlice';
import countReducer from './lib/slices/counterSlice';

export default configureStore({
  reducer: {
    count: countReducer,
    clock: clockReducer,
  },
  devTools: true,
});
