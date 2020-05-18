import { nanoid } from '@reduxjs/toolkit'

const notes = new Map()
const saveNote = (req, res) => {
  const { title, content } = req.body
  const errors = {}

  if (!title) errors['title'] = 'Title is required'

  if (!content) errors['content'] = 'Content is required'

  if (Object.keys(errors).length > 0)
    return res.status(422).json({
      statusCode: 422,
      message: 'Unprocessable Entity',
      errors,
    })

  const now = new Date()
  const note = { id: nanoid(), title, content, createdAt: now, updatedAt: now }
  notes.set(note.id, note)

  res.status(201).json(note)
}
const listNotes = (_, res) => {
  res.json(Array.from(notes.values()))
}
const updateNote = (req, res) => {
  const { noteId } = req.query
  const { title, content } = req.body

  if (!notes.has(noteId))
    return res.status(404).json({
      statusCode: 404,
      message: 'Not Found',
    })

  const note = notes.get(noteId)

  note.title = title || note.title
  note.content = content || note.content
  note.updatedAt = new Date()

  res.json(note)
}
const removeNote = (req, res) => {
  const { noteId } = req.query

  if (!notes.has(noteId))
    return res.status(404).json({
      statusCode: 404,
      message: 'Not Found',
    })

  notes.delete(noteId)

  res.status(204).send(null)
}

export default (req, res) => {
  switch (req.method) {
    case 'POST':
      saveNote(req, res)
      break
    case 'GET':
      listNotes(req, res)
      break
    case 'PUT':
      updateNote(req, res)
      break
    case 'DELETE':
      removeNote(req, res)
      break
    default:
      res.status(404).json({
        statusCode: 404,
        message: 'Not Found',
      })
      break
  }
}
