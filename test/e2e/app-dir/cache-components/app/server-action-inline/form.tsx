'use client'

import { useActionState } from 'react'
import { getSentinelValue } from '../getSentinelValue'

export function Form({ action }) {
  const [result, formAction] = useActionState(action, 'initial')

  return (
    <form action={formAction}>
      <h1>Inline Server Action with Cache Components</h1>
      <button>Submit</button>
      <p>{result}</p>
      <div id="page">{getSentinelValue()}</div>
    </form>
  )
}
