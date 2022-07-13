import dynamic from 'next/dynamic'

const Dynamic = dynamic(() => import('./dynamic.client.js'), { suspense: true })

export function NextDynamicClientComponent() {
  return (
    <>
      <Dynamic />
    </>
  )
}
