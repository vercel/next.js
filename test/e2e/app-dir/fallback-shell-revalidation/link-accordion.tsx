'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'

export function LinkAccordion({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <input
        type="checkbox"
        checked={visible}
        onChange={() => setVisible(!visible)}
        data-link-accordion={href}
      />
      {visible ? <Link href={href}>{children}</Link> : children}
    </div>
  )
}
