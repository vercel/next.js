'use client'

import { ReactNode } from 'react'

export function ClientWrapper({ children }: { children: ReactNode }) {
  return (
    <div>
      <p>Hello from a client wrapper</p>
      {children}
    </div>
  )
}
