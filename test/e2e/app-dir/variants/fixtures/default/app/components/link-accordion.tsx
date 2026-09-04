'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Keeps a `Link` out of the DOM until the checkbox is toggled.
 *
 * A `Link` prefetches when it enters the viewport. A test that asserts on the
 * contents of a prefetch has to know when that happens, so the link becomes
 * visible only inside an `act` scope.
 */
export function LinkAccordion({
  href,
  children,
}: {
  href: string
  children: ReactNode
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
        <Link href={href}>{children}</Link>
      ) : (
        <>{children} (link is hidden)</>
      )}
    </>
  )
}
