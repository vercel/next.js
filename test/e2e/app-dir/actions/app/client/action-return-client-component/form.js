'use client'
import { useActionState } from 'react'

export function Form({ action }) {
  const [state, formAction] = useActionState(action, null)
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
