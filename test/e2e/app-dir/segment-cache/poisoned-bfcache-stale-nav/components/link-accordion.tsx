'use client'

import Link, { type LinkProps } from 'next/link'
import { useState } from 'react'

export function LinkAccordion({
  href,
  prefetch,
  children,
}: {
  href: LinkProps['href']
  prefetch?: boolean
  children: React.ReactNode
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
        <Link href={href} prefetch={prefetch}>
          {children}
        </Link>
      ) : (
        `${children} (link is hidden)`
      )}
    </>
  )
}
