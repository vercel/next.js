import dynamic from 'next/dynamic'

const Dynamic = dynamic(() => import('../text-dynamic-server'), {
  // This ssr option will be ignored in server component
  ssr: false,
})

export function NextDynamicServerComponent() {
  return <Dynamic />
}
