'use client'

import { createTodo } from '@/app/actions'
import { useState } from 'react'

export default function Form() {
  const [message, setMessage] = useState('')

  async function onCreateTodo(formData: FormData) {
    const res = await createTodo(formData)
    setMessage(res.message)
  }

  return (
    <form action={onCreateTodo}>
      <input type="text" name="todo" />
      <button type="submit">Add</button>
      <p>{message}</p>
    </form>
  )
}
