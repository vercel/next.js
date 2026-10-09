import dynamic from 'next/dynamic'

const PageWidget = dynamic(() => import('../components/page-widget'), {
  ssr: true,
  loading: () => <p id="page-widget-loading">loading widget</p>,
})

export default function Page() {
  return (
    <main>
      <p>hello world</p>
      <PageWidget />
    </main>
  )
}
