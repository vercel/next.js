'use client'

import { useActionState } from 'react'
import { statefulServerAction } from './actions'

export function StatefulServerActionForm() {
  const [state, formAction] = useActionState(statefulServerAction, 'initial')

  return (
    <form action={formAction}>
      <button id="run-stateful-server-action">
        Run stateful Server Action
      </button>
      <p id="stateful-server-action-state">{state}</p>
    </form>
  )
}
