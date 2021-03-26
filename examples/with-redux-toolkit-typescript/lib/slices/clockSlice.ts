import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { CoreState } from '../../src/store'

type ClockState = {
  lastUpdate: number
  light: boolean
}

const initialState: ClockState = {
  lastUpdate: 0,
  light: true,
}

const clockSlice = createSlice({
  name: 'clock',
  initialState,
  reducers: {
    tick: (state, action: PayloadAction<ClockState>) => {
      state.lastUpdate = action.payload.lastUpdate
      state.light = !!action.payload.light
    },
  },
})

export const selectClock = (state: CoreState) => state.clock

export const { tick } = clockSlice.actions

export default clockSlice.reducer
