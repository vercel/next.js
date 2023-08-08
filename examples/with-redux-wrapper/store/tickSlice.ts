import {
  AnyAction,
  PayloadAction,
  createSlice,
  Dispatch,
} from '@reduxjs/toolkit'
import { HYDRATE } from 'next-redux-wrapper'

export interface TickState {
  lastUpdate: number
  light: boolean
}

const tickInitialState: TickState = {
  lastUpdate: 0,
  light: false,
}

export const tickSlice = createSlice({
  name: 'tick',
  initialState: tickInitialState,
  reducers: {
    tick: (state, action: PayloadAction<{ ts: number; light: boolean }>) => {
      state.lastUpdate = action.payload.ts
      state.light = !!action.payload.light
    },
  },
  extraReducers: (builder) => {
    builder.addCase(HYDRATE, (state, action: AnyAction) => ({
      ...state, // use previous state
      ...action.payload.tick, // apply delta from hydration
    }))
  },
})

export const { tick } = tickSlice.actions

export const startClock = () => (dispatch: Dispatch) => {
  return setInterval(
    () => dispatch(tick({ light: true, ts: Date.now() })),
    1000
  )
}

export const serverRenderClock =
  (isServer: boolean) => (dispatch: Dispatch) => {
    return dispatch(
      tick({
        light: !isServer,
        ts: Date.now(),
      })
    )
  }

export default tickSlice.reducer
