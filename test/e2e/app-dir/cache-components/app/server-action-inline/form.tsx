'use client'

import { ReactNode, useActionState } from 'react'

export function Form({ action }: { action: () => Promise<ReactNode> }) {
  const [result, formAction] = useActionState(action, 'initial')

  return (
    <form action={formAction}>
      <h1>Inline Server Action with Cache Components</h1>
      <button>Submit</button>
      <p>{result}</p>
    </form>
  )
}
