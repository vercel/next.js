'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Page() {
  useEffect(() => {
    console.error('test issue')
  }, [])

  return (
    <Link id="to-slow" href="/app/slow" prefetch={false}>
      Go to slow page
    </Link>
  )
}
