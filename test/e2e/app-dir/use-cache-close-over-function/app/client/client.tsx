'use client'

import { useActionState } from 'react'

export function Client({ getValue }) {
  const [result, formAction] = useActionState(getValue, 0)

  return (
    <form action={formAction}>
      <p>{result}</p>
      <button>Submit</button>
    </form>
  )
}
