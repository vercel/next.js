'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'

export function LinkAccordion({
  href,
  prefetch,
}: {
  href: string
  prefetch?: boolean
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <input
        type="checkbox"
        data-link-accordion={href}
        checked={visible}
        onChange={() => setVisible(!visible)}
      />
      {visible ? (
        <Link href={href} prefetch={prefetch}>
          {href}
        </Link>
      ) : null}
    </div>
  )
}

export function Client() {
  const params = useParams()
  const search = useSearchParams()
  const [count, setCount] = useState(0)
  return (
    <>
      <p id="params">{JSON.stringify(params)}</p>
      <p id="query">{search.get('value')}</p>
      <button id="counter" onClick={() => setCount(count + 1)}>
        {count}
      </button>
      <LinkAccordion href="/" />
    </>
  )
}
