'use client'

import Link, { type LinkProps } from 'next/link'
import { useState } from 'react'

export function LinkAccordion({
  href,
  children,
  prefetch,
}: {
  href: string
  children: React.ReactNode
  prefetch?: LinkProps['prefetch']
}) {
  const [isVisible, setIsVisible] = useState(false)
  return (
    <>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-link-accordion={href}
      />
      {isVisible ? (
        <Link prefetch={prefetch} href={href}>
          {children}
        </Link>
      ) : (
        <>{children} (link is hidden)</>
      )}
    </>
  )
}
