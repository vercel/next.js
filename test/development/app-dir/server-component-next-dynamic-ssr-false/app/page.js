import dynamic from 'next/dynamic'

const DynamicClient = dynamic(() => import('./client'), { ssr: false })

export default function Page() {
  return <DynamicClient />
}
