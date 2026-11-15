'use client'

import Link from 'next/link'
import { useState } from 'react'

export function LinkAccordion({ href }: { href: string }) {
  const [visible, setVisible] = useState(false)

  return (
    <>
      <input
        type="checkbox"
        aria-label={`Show ${href}`}
        data-link-accordion={href}
        checked={visible}
        onChange={() => setVisible(!visible)}
      />
      {visible ? <Link href={href}>Open article</Link> : null}
    </>
  )
}
