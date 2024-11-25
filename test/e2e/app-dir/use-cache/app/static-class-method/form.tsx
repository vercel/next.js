'use client'

import { useActionState } from 'react'

export function Form({
  getRandomValue,
}: {
  getRandomValue: () => Promise<number>
}) {
  const [result, formAction, isPending] = useActionState(getRandomValue, -1)

  return (
    <form action={formAction}>
      <button>Submit</button>
      <p>{isPending ? 'loading...' : result}</p>
    </form>
  )
}
