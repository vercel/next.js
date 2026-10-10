'use client'

import Link, { type LinkProps } from 'next/link'
import { useState } from 'react'

export function LinkAccordion({
  href,
  children,
  prefetch,
  scroll,
}: {
  href: string
  children?: React.ReactNode
  prefetch?: LinkProps['prefetch']
  scroll?: LinkProps['scroll']
}) {
  const [isVisible, setIsVisible] = useState(false)
  const resolvedChildren = children ?? href
  return (
    <>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-link-accordion={href}
      />
      {isVisible ? (
        <Link href={href} prefetch={prefetch} scroll={scroll}>
          {resolvedChildren}
        </Link>
      ) : (
        <>{resolvedChildren} (link is hidden)</>
      )}
    </>
  )
}
