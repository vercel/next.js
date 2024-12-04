'use client'

import { useActionState } from 'react'

export function Form({ action }) {
  const [result, formAction] = useActionState(action, 'initial')

  return (
    <form action={formAction}>
      <h1>Inline Server Action with Dynamic IO</h1>
      <button>Submit</button>
      <p>{result}</p>
    </form>
  )
}
