'use client'

import { useActionState } from 'react'
import { greetPreBound } from '../actions'

export function Form() {
  // Control: the action reference is stable across renders.
  const [state, formAction] = useActionState(
    greetPreBound,
    null,
    '/stable-action'
  )
  return (
    <form action={formAction}>
      <input name="name" defaultValue="world" />
      <button type="submit">submit</button>
      <pre id="state">{JSON.stringify(state)}</pre>
    </form>
  )
}
