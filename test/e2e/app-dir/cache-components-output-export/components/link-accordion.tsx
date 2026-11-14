'use client'

import Link from 'next/link'
import { useState, type ComponentProps, type ReactNode } from 'react'

export function LinkAccordion({
  href,
  prefetch,
  children,
}: {
  href: string
  prefetch?: ComponentProps<typeof Link>['prefetch']
  children: ReactNode
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <input
        type="checkbox"
        aria-label={href}
        data-link-accordion={href}
        checked={visible}
        onChange={() => setVisible(!visible)}
      />
      {visible ? (
        <Link href={href} prefetch={prefetch}>
          {children}
        </Link>
      ) : null}
    </div>
  )
}
