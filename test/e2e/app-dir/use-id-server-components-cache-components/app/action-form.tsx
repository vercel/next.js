'use client'

import { useTransition } from 'react'
import { noop } from './actions'

export function ActionForm() {
  const [, startTransition] = useTransition()
  return (
    <button id="run-action" onClick={() => startTransition(() => noop())}>
      run action
    </button>
  )
}
