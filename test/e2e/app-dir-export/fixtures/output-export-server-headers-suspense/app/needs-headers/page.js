import { Suspense } from 'react'
import { headers } from 'next/headers'

async function HeadersContent() {
  const requestHeaders = await headers()

  return <h1>{requestHeaders.get('user-agent')}</h1>
}

export default function HeadersPage() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <HeadersContent />
    </Suspense>
  )
}
