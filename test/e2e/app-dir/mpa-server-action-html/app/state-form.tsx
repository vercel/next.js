'use client'

import { useActionState, useEffect, useState } from 'react'
import type { FormState } from './actions'

export function StateForm({
  name,
  action,
}: {
  name: string
  action: (previous: FormState, data: FormData) => Promise<FormState>
  request?: Promise<string>
}) {
  const [state, formAction] = useActionState(action, { count: 0, message: '' })
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return (
    <form action={formAction}>
      <input name="message" defaultValue="Ada" />
      <button id={`submit-${name}`}>Submit {name}</button>
      <p id={`state-${name}`}>{`${state.count}:${state.message}`}</p>
      {hydrated ? <p id={`hydrated-${name}`}>Hydrated</p> : null}
    </form>
  )
}
