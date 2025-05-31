'use client'

import Link from 'next/link'
import { useState } from 'react'

export function LinkAccordion({
  href,
  children,
  prefetch,
  id,
}: {
  href: string
  children: string
  prefetch?: boolean
  id?: string
}) {
  const [isVisible, setIsVisible] = useState(false)
  return (
    <>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-link-accordion={href}
        id={id}
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
