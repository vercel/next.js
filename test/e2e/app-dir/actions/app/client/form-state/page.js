'use client'

import { experimental_useFormState } from 'react-dom'
import { appendName } from './actions'

export default function Page() {
  const [state, appendNameFormAction] = experimental_useFormState(
    appendName,
    'initial-state'
  )

  return (
    <form action={appendNameFormAction}>
      <p id="form-state">{state}</p>
      <input id="name-input" name="name" />
      <button id="submit-form" type="submit">
        log
      </button>
    </form>
  )
}
