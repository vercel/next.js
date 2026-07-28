'use client'

import { use, type ReactNode } from 'react'
import { browserOnly } from 'next/navigation'

export function BrowserOnlyContent({
  children,
  id,
}: {
  children: ReactNode
  id: string
}) {
  use(browserOnly())
  return <p id={id}>{children}</p>
}
