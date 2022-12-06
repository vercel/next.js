import dynamic from 'next/dynamic'

const Dynamic = dynamic(() => import('../text-dynamic-server-import-client'))

export function NextDynamicServerImportClientComponent() {
  return <Dynamic />
}
