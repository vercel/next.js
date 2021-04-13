import { NextPage } from 'next'
import Dynamic from 'next/dynamic'
import Head from 'next/head'
import { useEffect, useState } from 'react'

import { useAppDispatch, useAppSelector } from '../app/hooks'
import AddNoteForm from '../features/note/AddNote'
import { deleteNote, loadNotes, selectNotes } from '../features/note/notesSlice'
import { PersistedNote } from '../types/Note'

const EditNoteForm = Dynamic(import('../features/note/EditNote'), {
  ssr: false,
})

const Notes: NextPage = () => {
  const [selectedNote, setSelectedNote] = useState<PersistedNote>()
  const dispatch = useAppDispatch()
  const { notes } = useAppSelector(selectNotes)

  useEffect(() => {
    const promise = dispatch(loadNotes())

    return promise.abort()
  }, [dispatch])

  const renderNote = (note: PersistedNote) => (
    <li key={note.id}>
      <strong>{note.title}</strong>
      <br />
      <span>{note.content}</span>
      <br />
      <button
        aria-label={`Delete note with title: ${note.title}`}
        onClick={() => dispatch(deleteNote(note.id))}
      >
        🗑️
      </button>
      <button
        onClick={() => setSelectedNote(note)}
        aria-label={`Edit note with title: ${note.title}`}
      >
        ✏️
      </button>
    </li>
  )

  return (
    <>
      <Head>
        <title>Next.js with Redux Toolkit | Notes App</title>
      </Head>
      <AddNoteForm />
      <hr />
      <h3>All Notes</h3>
      <ul>{notes.map(renderNote)}</ul>
      {selectedNote && <EditNoteForm note={selectedNote} />}
    </>
  )
}

export default Notes
