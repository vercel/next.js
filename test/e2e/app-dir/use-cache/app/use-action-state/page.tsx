'use client'

import { useActionState } from 'react'
import { getRandomValue } from './cached'

export default function Page() {
  const [result, formAction, isPending] = useActionState(getRandomValue, -1)

  return (
    <form action={formAction}>
      <button id="submit-button">Submit</button>
      <p>{isPending ? 'loading...' : result}</p>
    </form>
  )
}
