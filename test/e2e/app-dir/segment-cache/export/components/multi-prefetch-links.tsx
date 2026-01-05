'use client'

import Link from 'next/link'
import { useState } from 'react'

/**
 * This component renders two Links to the same href but with different prefetch
 * values. This tests the fix for https://github.com/vercel/next.js/issues/88032
 * where having multiple Links with different prefetch values could cause
 * navigation to fail in output: "export" mode.
 */
export function MultiPrefetchLinks({ href, children }) {
  const [isVisible, setIsVisible] = useState(false)
  return (
    <>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-multi-prefetch-accordion={href}
      />
      {isVisible ? (
        <div>
          {/* Link with default prefetch (auto/PPR strategy) */}
          <Link href={href} data-link-default>
            {children} (default prefetch)
          </Link>
          <br />
          {/* Link with prefetch={true} (Full strategy) */}
          <Link href={href} prefetch={true} data-link-force-prefetch>
            {children} (force prefetch)
          </Link>
        </div>
      ) : (
        `${children} (links are hidden)`
      )}
    </>
  )
}
