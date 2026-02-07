'use client'

import { ReactNode } from 'react'

export default function ClientA({ children }: { children: ReactNode }) {
  return <a>{children}</a>
}
