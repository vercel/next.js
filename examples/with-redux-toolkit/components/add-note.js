import { useDispatch, useSelector } from 'react-redux'

import { addNote, selectNotes } from '../lib/slices/notesSlice'
import useForm from '../lib/useForm'

const AddNoteForm = () => {
  const dispatch = useDispatch()
  const { error } = useSelector(selectNotes)
  const handleSubmit = useForm({
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
      {'title' in (error || {}) && <small>{error.title}</small>}
      <br />
      <label htmlFor="contentText">
        Content:
        <textarea name="content" id="contentText"></textarea>
      </label>
      <br />
      {'content' in (error || {}) && <small>{error.content}</small>}
      <br />
      <button type="submit">Add note</button>
      <br />
      {typeof error === 'string' && <small>{error}</small>}
    </form>
  )
}

export default AddNoteForm
