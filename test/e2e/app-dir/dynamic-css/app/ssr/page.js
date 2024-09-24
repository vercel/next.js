'use client'

import dynamicApi from 'next/dynamic'

const AsyncFoo = dynamicApi(() => import('../../components/foo'))

export default function Page() {
  return <AsyncFoo />
}

export const dynamic = 'force-dynamic'
