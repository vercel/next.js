'use client'

import { useFormState } from 'react-dom'
import { action } from './action'

export default function Page() {
  const [submitted, formAction] = useFormState(action, false)
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
