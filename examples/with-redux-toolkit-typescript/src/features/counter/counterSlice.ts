import { createSlice, Dispatch } from '@reduxjs/toolkit'

import type { AppState } from '../../app/store'

type CounterState = {
  value: number
}

const initialState: CounterState = {
  value: 0,
}

const counterSlice = createSlice({
  name: 'counter',
  initialState,
  reducers: {
    // Redux Toolkit allows us to write "mutating" logic in reducers. It
    // doesn't actually mutate the state because it uses the Immer library,
    // which detects changes to a "draft state" and produces a brand new
    // immutable state based off those changes
    increment: (state) => {
      state.value += 1
    },
    decrement: (state) => {
      state.value -= 1
    },
    reset: (state) => {
      state.value = 0
    },
    incrementByAmount: (state, action) => {
      state.value += action.payload
    },
  },
})

/**
 * Extract count from root state
 *
 * @param   {Object} state The root state
 * @returns {number} The current count
 */
export const selectCount = (state: AppState) => state.counter.value

export const {
  increment,
  decrement,
  reset,
  incrementByAmount,
} = counterSlice.actions

// The function below is called a thunk and allows us to perform async logic. It
// can be dispatched like a regular action: `dispatch(incrementAsync(10))`. This
// will call the thunk with the `dispatch` function as the first argument. Async
// code can then be executed and other actions can be dispatched
export const incrementAsync = (amount: number) => (dispatch: Dispatch) => {
  setTimeout(() => {
    dispatch(incrementByAmount(amount))
  }, 1000)
}

export default counterSlice.reducer
