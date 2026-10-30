'use client'

import { use } from 'react'

const ready =
  typeof window === 'undefined'
    ? Promise.resolve()
    : new Promise<void>((resolve) => setTimeout(resolve, 300))

export function ClientSuspends() {
  use(ready)
  return null
}
