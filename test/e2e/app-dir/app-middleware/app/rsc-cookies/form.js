'use client'

import { useActionState } from 'react'

export function Form({ action }) {
  const [state, formAction] = useActionState(action, null)

  return (
    <form action={formAction}>
      <div id="action-result">Action Result: {state}</div>
      <button type="submit" id="submit-server-action">
        server action
      </button>
    </form>
  )
}
