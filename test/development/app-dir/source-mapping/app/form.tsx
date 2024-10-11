'use client'

import { useActionState } from 'react'

export function Form({ action }: { action: () => Promise<string> }) {
  const [result, formAction] = useActionState(action, 'initial')

  return (
    <form action={formAction}>
      <button>Submit</button>
      <p>{result}</p>
    </form>
  )
}
