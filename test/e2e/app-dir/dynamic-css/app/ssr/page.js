'use client'

import dynamic from 'next/dynamic'

const AsyncFoo = dynamic(() => import('../../components/foo'))

export default function Page() {
  return <AsyncFoo />
}
