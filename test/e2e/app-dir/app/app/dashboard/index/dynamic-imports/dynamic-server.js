import dynamic from 'next/dynamic'

const Dynamic = dynamic(() => import('../text-dynamic-server'), {
  ssr: false,
})

export function NextDynamicServerComponent() {
  return <Dynamic />
}
