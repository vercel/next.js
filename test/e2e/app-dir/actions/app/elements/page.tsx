'use client'
import * as React from 'react'
import { action } from './actions'

export default function Page() {
  const [state, formAction, isPending] = React.useActionState(
    action,
    <p>Hello, World!</p>
  )
  return (
    <>
      <form action={formAction} aria-busy={isPending}>
        <p>{isPending ? 'Pending' : 'Resolved'}</p>
        <label>
          Render
          <input defaultValue="" type="text" name="value" />
        </label>
        <input type="submit" />
        <output>{state}</output>
      </form>
    </>
  )
}
