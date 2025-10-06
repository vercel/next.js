'use client'

import { useFormState } from 'react-dom'

export function Form({ id, action }) {
  const [state, formAction] = useFormState(action, '')

  return (
    <>
      {state && <div id={`${id}-response`}>{state}</div>}
      <form action={formAction}>
        <button type="submit" id={id}>
          Test
        </button>
      </form>
    </>
  )
}
