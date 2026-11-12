'use client'

import dynamic from 'next/dynamic'

const Lazy = dynamic(() => import('./lazy'))

export function Client() {
  return <Lazy />
}
