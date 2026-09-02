'use client'

import Link, { type LinkProps } from 'next/link'
import { useState } from 'react'

export function LinkAccordion({
  href,
  children,
  prefetch,
}: {
  href: LinkProps['href']
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
        data-prefetch={getPrefetchKind(prefetch)}
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

function getPrefetchKind(prefetch: LinkProps['prefetch']) {
  switch (prefetch) {
    case false:
      return 'disabled'
    case undefined:
    case null:
    case 'auto':
      return 'auto'
    case true:
      return 'true'
    default:
      prefetch satisfies never
  }
}
