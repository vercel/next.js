import dynamic from 'next/dynamic'

const Component = dynamic(() => import('../app/client#component'))

export default function Page() {
  return <Component />
}
