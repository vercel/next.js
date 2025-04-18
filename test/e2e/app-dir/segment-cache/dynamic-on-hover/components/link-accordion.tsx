'use client'

import Link from 'next/link'
import { useState } from 'react'

export function LinkAccordion({
  href,
  children,
  prefetch,
  unstable_dynamicOnHover,
}: {
  href: string
  children: React.ReactNode
  prefetch?: boolean
  unstable_dynamicOnHover?: boolean
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
        <Link
          href={href}
          prefetch={prefetch}
          // @ts-expect-error - unstable_dynamicOnHover is not part of the public types
          unstable_dynamicOnHover={unstable_dynamicOnHover}
        >
          {children}
        </Link>
      ) : (
        <>{children} (link is hidden)</>
      )}
    </>
  )
}
