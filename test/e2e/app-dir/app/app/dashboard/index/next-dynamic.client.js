import dynamic from 'next/dynamic'

const Dynamic = dynamic(() => import('./dynamic.client'))

export function NextDynamicClientComponent() {
  return <Dynamic />
}
