import { headers } from 'next/headers'
import { Suspense } from 'react'
import { getActiveTraceId } from '../../trace-recorder'

async function RequestInfo() {
  const requestHeaders = Object.fromEntries((await headers()).entries())
  return (
    <>
      <pre id="trace-id">{getActiveTraceId()}</pre>
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

// Traced as a `generateMetadata` span in the render.
export async function generateMetadata() {
  return {}
}
