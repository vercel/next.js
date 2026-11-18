import { headers } from 'next/headers'
import { Suspense } from 'react'

export function generateStaticParams() {
  return Array.from({ length: 6 }, (_, id) => ({ id: String(id) }))
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // A suite-unique data URL exercises the fetch cache without a network server.
  // The final fallback shell must receive this entry from an initial render's
  // resume data cache, because that phase gets a fresh cache-handler instance.
  const response = await fetch(
    'data:text/plain,static-generation-adaptive-ppr%3Ashared-data',
    { cache: 'force-cache' }
  )
  const shared = await response.text()

  return (
    <main>
      <p id="shared">{shared}</p>
      <Suspense fallback={<p id="params-fallback">Loading item</p>}>
        <Item params={params} />
      </Suspense>
      <Suspense fallback={<p id="request-fallback">Loading request</p>}>
        <RequestContent />
      </Suspense>
    </main>
  )
}

async function Item({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <p id="item">item {id}</p>
}

async function RequestContent() {
  const requestHeaders = await headers()
  return <p id="request">{requestHeaders.get('x-adaptive-ppr')}</p>
}
