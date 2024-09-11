import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('../components/hello.tsx'))

export default function Page() {
  return <DynamicComponent />
}
