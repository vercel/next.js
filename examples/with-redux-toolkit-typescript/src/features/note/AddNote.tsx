import { useAppDispatch, useAppSelector, useForm } from '../../app/hooks'
import { isErrorResponse } from '../../types/ErrorResponse'
import { Note } from '../../types/Note'
import { addNote, selectNotes } from './notesSlice'

function AddNoteForm() {
  const dispatch = useAppDispatch()
  const { error } = useAppSelector(selectNotes)
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
