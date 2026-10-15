'use client'

import { useActionState, useEffect, useState } from 'react'
import { increment } from './actions'

export function CounterForm() {
  const [state, formAction] = useActionState(increment, { count: 0, name: '' })
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <form action={formAction}>
      <input name="name" defaultValue="Ada" />
      <button id="submit" type="submit">
        Submit
      </button>
      <p id="form-state">
        Submitted {state.count} time(s) as {state.name || '-'}
      </p>
      {hydrated ? <p id="hydrated">hydrated</p> : null}
    </form>
  )
}
