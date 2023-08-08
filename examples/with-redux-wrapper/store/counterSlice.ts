import { AnyAction, createSlice } from '@reduxjs/toolkit'
import { HYDRATE } from 'next-redux-wrapper'

interface CounterState {
  count: number
}

const counterInitialState: CounterState = {
  count: 0,
}

export const counterSlice = createSlice({
  name: 'counter',
  initialState: counterInitialState,
  reducers: {
    add: (state) => {
      state.count += 1
    },
  },
  extraReducers: (builder) => {
    builder.addCase(HYDRATE, (state, action: AnyAction) => {
      // preserve state on client navigation
      if (state.count) {
        return state
      }

      return {
        ...state, // use previous state
        ...action.payload.counter, // apply delta from hydration
      }
    })
  },
})

export const { add } = counterSlice.actions

export default counterSlice.reducer
