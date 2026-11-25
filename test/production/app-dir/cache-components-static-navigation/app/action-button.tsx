'use client'

import { useActionState } from 'react'
import { runAction } from './actions'

export function ActionButton() {
  const [result, action] = useActionState(runAction, '')
  return (
    <form action={action}>
      <button id="run-action">Run action</button>
      <p id="action-result">{result}</p>
    </form>
  )
}
