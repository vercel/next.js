'use client'

import type { ReactNode } from 'react'

export function FailOnSSR({ children }: { children: ReactNode }) {
  if (typeof window === 'undefined') {
    throw new Error('original Result shell failure')
  }
  return children
}
