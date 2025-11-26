'use client'

import { useActionState } from 'react'
import { action } from './action'

export default function Page() {
  const [submitted, formAction] = useActionState(action, false)
  if (submitted) {
    return <div>Form Submitted.</div>
  }

  return (
    <div>
      <h1>Form</h1>
      <form action={formAction}>
        <button id="submit-button">Push this button to submit the form</button>
      </form>
    </div>
  )
}
