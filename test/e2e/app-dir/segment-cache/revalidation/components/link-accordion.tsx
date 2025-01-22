'use client'

import Link from 'next/link'
import { useState } from 'react'

export function LinkAccordion({ href, children }) {
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
        `${children} (link is hidden)`
      )}
    </>
  )
}
