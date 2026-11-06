'use client'

import dynamic from 'next/dynamic'

const SsrTarget = dynamic(() => import('./ssr-target'))
const ClientTarget = dynamic(() => import('./client-target'), { ssr: false })

export default function DynamicComponents() {
  return (
    <>
      <SsrTarget />
      <ClientTarget />
    </>
  )
}
