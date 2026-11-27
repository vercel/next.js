'use client'

import Link from 'next/link'
import { useState } from 'react'

export function LinkAccordion({
  href,
  prefetch,
}: {
  href: string
  prefetch?: false
}) {
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
      {visible ? (
        <Link href={href} prefetch={prefetch}>
          Open {href}
        </Link>
      ) : null}
    </>
  )
}
