'use client'

import Link, { type LinkProps } from 'next/link'
import { useState } from 'react'

export function LinkAccordion({
  href,
  children,
  id,
}: {
  href: LinkProps['href']
  children: React.ReactNode
  id?: string
}) {
  const [isVisible, setIsVisible] = useState(false)
  return (
    <>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-link-accordion={id ?? href}
      />
      {isVisible ? (
        <Link href={href}>{children}</Link>
      ) : (
        `${children} (link is hidden)`
      )}
    </>
  )
}
