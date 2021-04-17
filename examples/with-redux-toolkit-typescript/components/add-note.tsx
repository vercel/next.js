import { FC } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { addNote, selectNotes } from '../lib/slices/notesSlice'
import useForm from '../lib/useForm'
import { Note } from '../types/Note'
import { isErrorResponse } from '../types/ErrorResponse'

const AddNoteForm: FC = () => {
  const dispatch = useDispatch()
  const { error } = useSelector(selectNotes)
  const handleSubmit = useForm<Note>({
    title: '',
    content: '',
  })

  return (
    <form onSubmit={handleSubmit((data) => dispatch(addNote(data)))}>
      <h3>Create a Note</h3>
      <label htmlFor="titleText">
        Title:
        <input type="text" name="title" id="titleText" />
      </label>
      <br />
      {isErrorResponse(error) && <small>{error.title}</small>}
      <br />
      <label htmlFor="contentText">
        Content:
        <textarea name="content" id="contentText" />
      </label>
      <br />
      {isErrorResponse(error) && <small>{error.content}</small>}
      <br />
      <button type="submit">Add note</button>
      <br />
      {!isErrorResponse(error) && <small>{error}</small>}
    </form>
  )
}

export default AddNoteForm
