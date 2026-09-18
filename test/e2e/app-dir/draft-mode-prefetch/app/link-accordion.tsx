'use client'

import Link, { type LinkProps } from 'next/link'
import { useState, type ReactNode } from 'react'

export function LinkAccordion({
  href,
  children,
  prefetch,
}: {
  href: string
  children: ReactNode
  prefetch?: LinkProps['prefetch']
}) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <>
      <input
        type="checkbox"
        aria-label={`Show ${href}`}
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
    </>
  )
}
