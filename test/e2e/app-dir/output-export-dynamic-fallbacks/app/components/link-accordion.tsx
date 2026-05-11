'use client'

import Link from 'next/link'
import { useState } from 'react'

export function LinkAccordion({
  children,
  href,
}: {
  children: React.ReactNode
  href: string
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
      {isVisible ? <Link href={href}>{children}</Link> : children}
    </>
  )
}
