'use client'

import Link from 'next/link'
import { useTestHarness } from '@turbo/pack-test-harness'

export default function Page() {
  useTestHarness((mod) => mod.markAsHydrated())

  return (
    <Link href="/segment" data-test-link>
      -&gt; Segment not found
    </Link>
  )
}
