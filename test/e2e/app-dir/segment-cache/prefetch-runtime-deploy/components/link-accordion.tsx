'use client'

import Link from 'next/link'
import { useState } from 'react'

export function LinkAccordion({
  href,
  children,
}: {
  href: string
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
        // A full-prefetch link: on a route whose only prefetch opt-in is
        // `allow-runtime`, auto links skip the speculative phase (no eager
        // segment; they rely on the shared app shell), so only a full
        // prefetch spawns the runtime prefetch under test.
        <Link href={href} prefetch>
          {children}
        </Link>
      ) : (
        <>{children} (link is hidden)</>
      )}
    </>
  )
}
