'use client'

import { useActionState } from 'react'

export default function Form({ action }) {
  const [result, formAction] = useActionState(action, 'initial')

  return (
    <form action={formAction}>
      <button>Submit</button>
      <p>{result}</p>
    </form>
  )
}
