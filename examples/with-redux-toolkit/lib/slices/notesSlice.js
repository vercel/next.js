import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'

export const addNote = createAsyncThunk(
  'notes/addNote',
  async (newNote, thunkAPI) => {
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        body: JSON.stringify(newNote),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const error = await response.json()

        return thunkAPI.rejectWithValue({ error: error.errors })
      }

      return response.json()
    } catch (error) {
      return thunkAPI.rejectWithValue({ error: error.message })
    }
  }
)

export const loadNotes = createAsyncThunk(
  'notes/loadNotes',
  async (_, thunkAPI) => {
    try {
      const response = await fetch('/api/notes')

      return response.json()
    } catch (error) {
      return thunkAPI.rejectWithValue({ error: error.message })
    }
  }
)

const notesSlice = createSlice({
  name: 'notes',
  initialState: {
    notes: [],
    loading: 'idle',
  },
  reducers: {},
  extraReducers: {
    [addNote.pending]: state => {
      delete state.error
    },
    [addNote.fulfilled]: (state, action) => {
      state.notes.push(action.payload)
    },
    [addNote.rejected]: (state, action) => {
      state.error = action.payload.error
    },
    [loadNotes.pending]: state => {
      state.notes = []
      state.loading = 'loading'
    },
    [loadNotes.fulfilled]: (state, action) => {
      state.notes = action.payload
      state.loading = 'loaded'
    },
    [loadNotes.rejected]: (state, action) => {
      state.loading = 'error'
      state.error = action.payload.error
    },
  },
})

export default notesSlice.reducer
