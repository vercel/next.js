import Head from 'next/head'
import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import AddNoteForm from '../components/add-note'
import { loadNotes, selectNotes } from '../lib/slices/notesSlice'

const Notes = () => {
  const dispatch = useDispatch()
  const { notes } = useSelector(selectNotes)

  useEffect(() => {
    async function dispatchLoadNotes() {
      await dispatch(loadNotes())
    }
    dispatchLoadNotes()
  }, [dispatch])

  const renderNote = note => (
    <li key={note.id}>
      <strong>{note.title}</strong>
      <br />
      <span>{note.content}</span>
    </li>
  )

  return (
    <>
      <Head>
        <title>React Redux Toolkit | Notes App</title>
      </Head>
      <AddNoteForm />
      <hr />
      <h3>All Notes</h3>
      <ul>{notes.map(renderNote)}</ul>
    </>
  )
}

export default Notes
