import dynamic from 'next/dist/client/components/shared/dynamic'

// import { useEffect } from 'react'

const Dynamic = dynamic(() => import('../text-dynamic-server'))

export function NextDynamicServerComponent() {
  return <Dynamic />
}
