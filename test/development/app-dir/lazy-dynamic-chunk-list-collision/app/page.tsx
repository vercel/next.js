'use client'

import dynamic from 'next/dynamic'

const Target = dynamic(() => import('./target'))

export default function Page() {
  return <Target />
}
