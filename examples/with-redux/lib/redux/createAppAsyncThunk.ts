/* Core */
import { createAsyncThunk } from '@reduxjs/toolkit'

/* Instruments */
import type { ReduxState, ReduxDispatch } from './store'

/**
 * ? A utility function to create a typed Async Thnuk Actions.
 */
export const createAppAsyncThunk = createAsyncThunk.withTypes<{
  state: ReduxState
  dispatch: ReduxDispatch
  rejectValue: string
}>()
