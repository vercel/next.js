'use client'

import { useActionState } from 'react'
import { action } from './action'

export function ActionForm() {
  const [result, formAction] = useActionState(action, 'initial')

  return (
    <form action={formAction}>
      <button>Submit</button>
      <p id="action-state">{result}</p>
    </form>
  )
}
