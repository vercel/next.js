'use client'
import { useFormState } from 'react-dom'

export function Form({ action }) {
  const [state, formAction] = useFormState(action, null)
  return (
    <>
      <form action={formAction}>
        <button id="trigger-component-load" type="submit">
          Trigger Component Load
        </button>
      </form>
      {state?.component}
    </>
  )
}
