'use client'

import dynamic from 'next/dynamic'

const Client1 = dynamic(() => import('./client'))
const Client2 = dynamic(() => import('./client-no-ssr'), { ssr: false })

export default function Page() {
  return (
    <>
      <Client1 id="client-button" />
      <Client2 id="client-button-no-ssr" />
    </>
  )
}
