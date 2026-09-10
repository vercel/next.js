'use client'

import Link from 'next/link'
import { useState, type JSX } from 'react'

export function LinkAccordion({ href }: { href: string }): JSX.Element {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-link-accordion={href}
      />
      {isVisible ? <Link href={href}>Catch-all page</Link> : null}
    </>
  )
}
