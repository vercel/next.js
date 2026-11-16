'use client'

import Link from 'next/link'
import { useState } from 'react'

export function LinkAccordion({
  href,
  id = 'target',
  prefetch = false,
}: {
  href: string
  id?: string
  prefetch?: boolean
}) {
  const [visible, setVisible] = useState(false)
  return (
    <>
      <input
        id={'show-' + id}
        type="checkbox"
        checked={visible}
        onChange={() => setVisible(!visible)}
      />
      {visible ? (
        <Link id={id} href={href} prefetch={prefetch}>
          Navigate
        </Link>
      ) : null}
    </>
  )
}
