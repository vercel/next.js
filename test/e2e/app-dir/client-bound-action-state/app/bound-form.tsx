'use client'

import { useActionState } from 'react'
import type { UpdateState } from './actions'

const initialState: UpdateState = { message: '' }

export function BoundForm({
  action,
}: {
  action: (
    previousState: UpdateState,
    formData: FormData
  ) => Promise<UpdateState>
}) {
  const [state, formAction] = useActionState(action, initialState)

  return (
    <form action={formAction} id="server-bound-form">
      <input name="name" defaultValue="Ada" />
      <button type="submit" id="server-bound-submit">
        Update server-bound user
      </button>
      <output id="server-bound-state">{state.message}</output>
    </form>
  )
}
