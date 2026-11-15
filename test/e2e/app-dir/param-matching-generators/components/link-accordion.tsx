'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'

export function LinkAccordion({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  const [isVisible, setIsVisible] = useState(false)
  return (
    <div>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-link-accordion={href}
      />
      {isVisible ? <Link href={href}>{children}</Link> : children}
    </div>
  )
}
