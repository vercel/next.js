'use client'

import { useActionState } from 'react'
import { action } from './action'

export default function Home() {
  const [result, formAction] = useActionState(action, null)

  return (
    <form action={formAction}>
      <button>Click!</button>
      <div id="result">{result}</div>
    </form>
  )
}
