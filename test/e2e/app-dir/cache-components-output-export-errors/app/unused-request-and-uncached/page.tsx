import { headers } from 'next/headers'
import { Suspense } from 'react'

async function UncachedContent() {
  const response = await fetch(
    `${process.env.CC_EXPORT_DATA_URL}/unused-request-and-uncached`,
    { cache: 'no-store' }
  )
  return <p>{await response.text()}</p>
}

export default function Page() {
  headers()
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <UncachedContent />
    </Suspense>
  )
}
