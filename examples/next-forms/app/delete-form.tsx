'use client'

import { experimental_useFormState as useFormState } from 'react-dom'
import { deleteTodo } from '@/app/actions'

const initialState = {
  message: null,
}

export async function DeleteForm({ id }: { id: number }) {
  const [state, formAction] = useFormState(deleteTodo, initialState)

  console.log('state', state)

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button type="submit">Delete</button>
    </form>
  )
}
