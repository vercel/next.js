'use client'

import Link from 'next/link'
import { useState } from 'react'

export function LinkAccordion({ href, children, id }) {
  const [isVisible, setIsVisible] = useState(false)
  return (
    <>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-link-accordion={href}
        id={`accordion-${id}`}
      />
      {isVisible ? (
        <Link href={href} id={id}>
          {children}
        </Link>
      ) : (
        <>{children} (link is hidden)</>
      )}
    </>
  )
}
