import dynamic from 'next/dist/client/components/shared/dynamic'

const Dynamic = dynamic(() => import('../dynamic.server'))

export function NextDynamicServerComponent() {
  return <Dynamic />
}
