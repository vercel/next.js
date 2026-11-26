'use client'

import { use } from 'react'

export function Client({ data }: { data: Promise<string> }) {
  if (typeof window !== 'undefined') {
    return <p suppressHydrationWarning>{use(data)}</p>
  }
  return <p suppressHydrationWarning>Promise not consumed during SSR</p>
}
