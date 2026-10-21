import { headers } from 'next/headers'
import { Suspense } from 'react'
import { getRenderSpans } from '../../trace-recorder'
import { markMetadataGenerated, metadataGenerated } from '../../metadata-ready'

async function RequestInfo() {
  const requestHeaders = Object.fromEntries((await headers()).entries())
  await metadataGenerated()
  return (
    <>
      <pre id="spans">{JSON.stringify(getRenderSpans())}</pre>
      <pre id="headers">{JSON.stringify(requestHeaders)}</pre>
    </>
  )
}

export default function Page() {
  return (
    <Suspense>
      <RequestInfo />
    </Suspense>
  )
}

export async function generateMetadata() {
  markMetadataGenerated('page')
  return {}
}
