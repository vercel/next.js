'use client'

import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('./csr').then((mod) => mod.CSR), {
  ssr: false,
})

export default function Client() {
  return (
    <div>
      <DynamicComponent />
    </div>
  )
}
