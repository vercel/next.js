import dynamic from 'next/dynamic'

const PageWidget = dynamic(() => import('../components/page-widget'), {
  ssr: true,
  loading: () => <p id="page-widget-loading">loading widget</p>,
})

export default function SsrPage() {
  return (
    <main>
      <p>hello world</p>
      <PageWidget />
    </main>
  )
}

// Rendered on demand, so `__NEXT_DATA__` is produced by the server at request
// time instead of at build time.
export function getServerSideProps() {
  return { props: {} }
}
