'use client'

import { useActionState } from 'react'
import { updateUser, type UpdateState } from './actions'

const initialState: UpdateState = { message: '' }

export function ClientBoundForm({ userId }: { readonly userId: string }) {
  const updateUserWithId = updateUser.bind(null, userId)
  const [state, formAction] = useActionState(updateUserWithId, initialState)

  return (
    <form action={formAction} id="client-bound-form">
      <input name="name" defaultValue="Ada" />
      <button type="submit" id="client-bound-submit">
        Update client-bound user
      </button>
      <output id="client-bound-state">{state.message}</output>
    </form>
  )
}
