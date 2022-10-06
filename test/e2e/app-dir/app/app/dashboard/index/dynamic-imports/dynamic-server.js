import dynamic from 'next/dynamic'

const Dynamic = dynamic(() => import('../text-dynamic-server'))

export function NextDynamicServerComponent() {
  return <Dynamic />
}
