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
  const prefetchAttr = prefetch === null ? 'auto' : `${prefetch}`
  return (
    <>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-link-accordion={href}
        data-prefetch={prefetchAttr}
      />
      {isVisible ? (
        <Link href={href} prefetch={prefetch}>
          {children}
        </Link>
      ) : (
        <>{children} (link is hidden)</>
      )}
    </>
  )
}

export function DebugLinkAccordion({
  href,
  prefetch = 'auto',
}: {
  href: string
  prefetch?: LinkProps['prefetch']
}) {
  const prefetchDisplay = prefetch === null ? 'auto' : `${prefetch}`
  return (
    <LinkAccordion href={href} prefetch={prefetch}>
      {href} (prefetch={prefetchDisplay})
    </LinkAccordion>
  )
}
