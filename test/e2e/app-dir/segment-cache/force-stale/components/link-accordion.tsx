'use client'

import Link, { type LinkProps } from 'next/link'
import { useState } from 'react'

export function LinkAccordion({
  href,
  children,
  prefetch,
  id,
}: {
  href: string
  children: React.ReactNode
  prefetch?: LinkProps['prefetch']
  // Distinguishes accordions that share an href.
  id?: string
}) {
  const [isVisible, setIsVisible] = useState(false)
  return (
    <>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-link-accordion={id ?? href}
      />
      {isVisible ? (
        <Link href={href} prefetch={prefetch} id={id}>
          {children}
        </Link>
      ) : (
        <>{children} (link is hidden)</>
      )}
    </>
  )
}
