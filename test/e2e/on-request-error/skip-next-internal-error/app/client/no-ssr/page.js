'use client'

import nextDynamic from 'next/dynamic'

const Component = nextDynamic(() => import('./component'))

export default function Page() {
  return <Component />
}

export const dynamic = 'force-dynamic'
