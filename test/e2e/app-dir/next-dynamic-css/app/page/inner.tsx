'use client'

import dynamic from 'next/dynamic'
const Component = dynamic(() => import('./component'))

export default async function Inner() {
  return <Component />
}
