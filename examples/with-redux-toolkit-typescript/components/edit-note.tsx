import { FC } from 'react'
import { useLayoutEffect, useRef } from 'react'
import { useDispatch } from 'react-redux'

import { editNote } from '../lib/slices/notesSlice'
import useForm from '../lib/useForm'
import { PersistedNote } from '../types/Note'

type Props = {
  note: PersistedNote
}

const EditNoteForm: FC<Props> = ({ note }) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const dispatch = useDispatch()
  const handleSubmit = useForm<PersistedNote>(note)

  useLayoutEffect(() => {
    const isOpen = Object.keys(note).length > 0
    if (isOpen) {
      dialogRef.current?.setAttribute('open', 'true')
    }
  }, [note])

  return (
    <dialog ref={dialogRef}>
      <form
        onSubmit={handleSubmit(async (data) => {
          await dispatch(editNote(data))
          dialogRef.current?.removeAttribute('open')
        })}
      >
        <h3>Edit Note</h3>
        <label htmlFor="titleInput">
          Title:
          <input
            type="text"
            name="title"
            id="titleInput"
            defaultValue={note.title}
          />
        </label>
        <br />
        <label htmlFor="contentInput">
          Content:
          <textarea
            name="content"
            id="contentInput"
            defaultValue={note.content}
          />
        </label>
        <br />
        <button type="submit">Edit</button>
        <br />
      </form>
    </dialog>
  )
}

export default EditNoteForm
