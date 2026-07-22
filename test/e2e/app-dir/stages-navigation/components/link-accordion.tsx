'use client'

import Link, { type LinkProps } from 'next/link'
import { useState } from 'react'

// Controls when a <Link> enters the DOM. A Next.js <Link> triggers a prefetch
// when it enters the viewport (via IntersectionObserver). By hiding the Link
// behind a checkbox toggle, tests control exactly when prefetches happen —
// only when the accordion is explicitly toggled inside an `act` scope.
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
        data-prefetch={getPrefetchKind(prefetch)}
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

// A stable label for the `prefetch` prop, exposed as a `data-prefetch`
// attribute so tests can distinguish multiple accordions that point to the
// same href but use different prefetch modes.
function getPrefetchKind(prefetch: LinkProps['prefetch']): string {
  switch (prefetch) {
    case false:
      return 'disabled'
    case undefined:
    case null:
    case 'auto':
      return 'auto'
    case true:
      return 'true'
    case 'prefetch':
      return 'prefetch'
    case 'navigation':
      return 'navigation'
    default:
      prefetch satisfies never
      return 'unknown'
  }
}
