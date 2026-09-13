'use client'

import { useTransition } from 'react'
import { revalidate } from './actions'

export function ActionForm() {
  const [, startTransition] = useTransition()
  return (
    <button id="run-action" onClick={() => startTransition(() => revalidate())}>
      run action
    </button>
  )
}
