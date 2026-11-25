'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Page() {
  useEffect(() => {
    console.error('test issue')
  }, [])

  return (
    <>
      <Link
        id="to-enabled-slow"
        href="/app/build-indicator/enabled-slow"
        prefetch={false}
      >
        Go to enabled slow page
      </Link>
      <Link
        id="to-disabled-slow"
        href="/app/build-indicator/disabled-slow"
        prefetch={false}
      >
        Go to disabled slow page
      </Link>
    </>
  )
}
