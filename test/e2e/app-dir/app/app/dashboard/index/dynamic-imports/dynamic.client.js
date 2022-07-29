import dynamic from 'next/dist/client/components/shared/dynamic'

const Dynamic = dynamic(() => import('../text-dynamic.client'))

export function NextDynamicClientComponent() {
  return <Dynamic />
}
