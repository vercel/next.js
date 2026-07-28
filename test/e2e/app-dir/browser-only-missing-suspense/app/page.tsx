'use client'

import { use } from 'react'
import { browserOnly } from 'next/navigation'

export default function Page() {
  use(browserOnly())
  return <p>unreachable during prerender</p>
}
