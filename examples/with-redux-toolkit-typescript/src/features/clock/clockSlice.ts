import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import type { AppState } from '../../app/store'

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

export const selectClock = (state: AppState) => state.clock

export const { tick } = clockSlice.actions

export default clockSlice.reducer
