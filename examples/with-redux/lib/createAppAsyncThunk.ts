import { createAsyncThunk } from '@reduxjs/toolkit'
import type { AppDispatch, RootState } from './store'

/**
 * A utility function that provides a pre-typed version of {@linkcode createAsyncThunk}
 * that has the types for `state` and `dispatch` built in.
 * This lets you set up those types once, so you don't have to repeat
 * them each time you call {@linkcode createAsyncThunk}.
 */
export const createAppAsyncThunk = createAsyncThunk.withTypes<{
  state: RootState
  dispatch: AppDispatch
  rejectValue: string
}>()
