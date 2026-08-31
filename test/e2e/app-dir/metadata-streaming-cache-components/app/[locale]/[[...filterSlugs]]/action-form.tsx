'use client'

import { useActionState } from 'react'
import { submitAction } from './action'

export function ActionForm() {
  const [result, formAction] = useActionState(submitAction, 'initial', '/en')

  return (
    <form action={formAction} id="action-form">
      <button id="submit-action" type="submit">
        Submit action
      </button>
      <p id="action-result">{result}</p>
    </form>
  )
}
