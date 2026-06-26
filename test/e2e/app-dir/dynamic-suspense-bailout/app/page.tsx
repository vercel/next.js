import dynamic from 'next/dynamic'

const DynamicClient = dynamic(() => import('../components/dynamic-client'), {
  ssr: false,
  loading: undefined,
})

export default function Page() {
  return (
    <div>
      <h1 id="page-content">Page Content</h1>
      <DynamicClient />
    </div>
  )
}
