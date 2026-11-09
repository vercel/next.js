import { headers } from 'next/headers'
import { Suspense } from 'react'
import { getActiveTraceId } from '../../trace-recorder'

async function TraceId() {
  // Reading request headers also makes this run at request time, so the
  // reported trace is the request's.
  await headers()
  return <pre id="trace-id">{getActiveTraceId()}</pre>
}

export default function Page() {
  return (
    <Suspense>
      <TraceId />
    </Suspense>
  )
}

// Traced as a `generateMetadata` span in the render.
export async function generateMetadata() {
  return {}
}
