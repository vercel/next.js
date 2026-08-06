'use client'

import { use } from 'react'

const infinitePromise = new Promise<never>(() => {})

export function SuspendForeverOnClient() {
  use(infinitePromise)
  return null
}
