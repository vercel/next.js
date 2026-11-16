'use client'

import Link from 'next/link'
import { useState } from 'react'

export function LinkAccordion({ href }: { href: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <>
      <input
        id="show-target"
        type="checkbox"
        checked={visible}
        onChange={() => setVisible(!visible)}
      />
      {visible ? (
        <Link id="target" href={href} prefetch={false}>
          Navigate
        </Link>
      ) : null}
    </>
  )
}
