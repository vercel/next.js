'use client'

import { useActionState } from 'react'
import { action } from './action'

export default function Page() {
  const [result, formAction] = useActionState(() => action('result'), 'initial')

  return (
    <form action={formAction}>
      <h1>Server Action with Dynamic IO</h1>
      <button>Submit</button>
      <p>{result}</p>
    </form>
  )
}
