import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit'
import { Note, PersistedNote } from '../../types/Note'
import { CoreState } from '../../src/store'
import { ErrorResponse } from '../../types/ErrorResponse'

type ErrorResult = {
  error: ErrorResponse | string
}

type ThunkConfig = { rejectValue: ErrorResult }

export const addNote = createAsyncThunk<PersistedNote, Note, ThunkConfig>(
  'notes/addNote',
  async (newNote: Note, thunkAPI) => {
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

export const loadNotes = createAsyncThunk<PersistedNote[], void, ThunkConfig>(
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

export const editNote = createAsyncThunk<
  PersistedNote,
  PersistedNote,
  ThunkConfig
>('notes/editNote', async (updates, thunkAPI) => {
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
})

export const deleteNote = createAsyncThunk<string, string, ThunkConfig>(
  'notes/deleteNote',
  async (id, thunkAPI) => {
    try {
      await fetch(`/api/notes?noteId=${id}`, { method: 'DELETE' })
      return id
    } catch (error) {
      return thunkAPI.rejectWithValue({ error: error.message })
    }
  }
)

enum LoadingState {
  IDLE = 'idle',
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error',
}

type NoteState = {
  notes: PersistedNote[]
  loading: LoadingState
  error?: ErrorResponse | string
  tempNote?: PersistedNote
  backupNote?: PersistedNote
  backupPosition?: number
}

const initialState: NoteState = {
  notes: [],
  loading: LoadingState.IDLE,
  error: undefined,
  tempNote: undefined,
  backupNote: undefined,
  backupPosition: undefined,
}

const notesSlice = createSlice({
  name: 'notes',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(addNote.pending, (state) => {
      delete state.error
    })

    builder.addCase(addNote.fulfilled, (state, action) => {
      state.notes.push(action.payload)
    })

    builder.addCase(addNote.rejected, (state, action) => {
      state.error = action.payload?.error
    })

    builder.addCase(loadNotes.pending, (state) => {
      state.notes = []
      state.loading = LoadingState.LOADING
    })

    builder.addCase(loadNotes.fulfilled, (state, action) => {
      state.notes = action.payload
      state.loading = LoadingState.LOADED
    })

    builder.addCase(loadNotes.rejected, (state, action) => {
      state.loading = LoadingState.ERROR
      state.error = action.payload?.error
    })

    builder.addCase(editNote.pending, (state, action) => {
      const note = state.notes.find((note) => note.id === action.meta.arg.id)
      if (!note) return
      state.tempNote = Object.assign({}, note)
      note.title = action.meta.arg.title || note.title
      note.content = action.meta.arg.content || note.content
    })

    builder.addCase(editNote.fulfilled, (state, action) => {
      const note = state.notes.find((note) => note.id === action.payload.id)
      delete state.tempNote
      Object.assign(note, action.payload)
    })

    builder.addCase(editNote.rejected, (state, action) => {
      const note = state.notes.find((note) => note.id === action.meta.arg.id)
      state.error = action.payload?.error || action.error.message
      Object.assign(note, state.tempNote)
      delete state.tempNote
    })

    builder.addCase(deleteNote.pending, (state, action) => {
      const position = state.notes.findIndex(
        (note) => note.id === action.meta.arg
      )
      state.backupNote = Object.assign({}, state.notes[position])
      state.backupPosition = position
      state.notes.splice(position, 1)
    })

    builder.addCase(deleteNote.fulfilled, (state) => {
      delete state.backupNote
      delete state.backupPosition
    })

    builder.addCase(deleteNote.rejected, (state) => {
      if (!state.backupPosition || !state.backupNote) return
      state.notes.splice(state.backupPosition, 0, state.backupNote)
      delete state.backupPosition
      delete state.backupNote
    })
  },
})

export const selectNotes = createSelector(
  (state: CoreState) => ({
    notes: state.notes.notes,
    error: state.notes.error,
  }),
  (state) => state
)

export default notesSlice.reducer
