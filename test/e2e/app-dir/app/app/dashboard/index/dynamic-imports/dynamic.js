import dynamic from 'next/dist/client/components/shared/dynamic'

const Dynamic = dynamic(() => import('../text-dynamic'))

export function NextDynamicServerComponent() {
  return <Dynamic />
}
