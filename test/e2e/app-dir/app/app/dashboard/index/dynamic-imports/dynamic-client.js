'use client'

import dynamic from 'next/dynamic'

const Dynamic = dynamic(() => import('../text-dynamic-client'), {
  ssr: false,
})

export function NextDynamicClientComponent() {
  return <Dynamic />
}
