import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('../components/hello'))

export default function Page() {
  return <DynamicComponent />
}
