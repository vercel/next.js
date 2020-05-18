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

export const editNote = createAsyncThunk(
  'notes/editNote',
  async (updates, thunkAPI) => {
    const { id, title, content } = updates

    try {
      const response = await fetch(`/api/notes?noteId=${id}`, {
        method: 'PUT',
        body: JSON.stringify({ title, content }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

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
    [editNote.pending]: (state, action) => {
      const note = state.notes.find(note => note.id === action.meta.arg.id)
      state.tempNote = Object.assign({}, note)
      note.title = action.meta.arg.title || note.title
      note.content = action.meta.arg.content || note.content
    },
    [editNote.fulfilled]: (state, action) => {
      const note = state.notes.find(note => note.id === action.payload.id)
      delete state.tempNote
      Object.assign(note, action.payload)
    },
    [editNote.rejected]: (state, action) => {
      const note = state.notes.find(note => note.id === action.meta.arg.id)
      state.error = action.payload.error || action.error.message
      Object.assign(note, state.tempNote)
      delete state.tempNote
    },
  },
})

export default notesSlice.reducer
