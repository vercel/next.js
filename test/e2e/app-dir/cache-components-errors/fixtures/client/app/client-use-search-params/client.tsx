'use client'

import { useSearchParams } from 'next/navigation'

export function Client() {
  useSearchParams()
  return <p>hello world</p>
}
