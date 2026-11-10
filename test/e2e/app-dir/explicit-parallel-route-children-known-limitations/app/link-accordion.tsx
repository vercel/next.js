'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'

export function LinkAccordion({
  href,
  id,
  children,
}: {
  href: string
  id: string
  children: ReactNode
}) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <span>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-link-accordion={href}
      />
      {isVisible ? (
        <Link id={`to-${id}`} href={href}>
          {children}
        </Link>
      ) : (
        `${children} (link is hidden)`
      )}
    </span>
  )
}
