import { configureStore } from '@reduxjs/toolkit';

import clock from './lib/slices/clockSlice';
import count from './lib/slices/counterSlice';

export default configureStore({
  reducer: {
    count,
    clock,
  },
  devTools: true,
});
