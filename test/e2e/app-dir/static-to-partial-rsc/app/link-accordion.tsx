'use client'

import Link, { type LinkProps } from 'next/link'
import { useState, type ReactNode } from 'react'

export function LinkAccordion({
  href,
  prefetch = 'auto',
  children,
}: {
  href: string
  prefetch?: LinkProps['prefetch']
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
      {isVisible ? (
        <Link href={href} prefetch={prefetch}>
          {children}
        </Link>
      ) : (
        <span>{children} (link is hidden)</span>
      )}
    </div>
  )
}
