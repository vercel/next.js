'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useTestHarness } from '@turbo/pack-test-harness'

export default function Page() {
  useTestHarness((mod) => mod.markAsHydrated())

  return (
    <Link href="/not-found" data-test-link>
      -&gt; Not found
    </Link>
  )
}
