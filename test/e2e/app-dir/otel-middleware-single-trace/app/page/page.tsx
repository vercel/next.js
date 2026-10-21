import { headers } from 'next/headers'
import { Suspense } from 'react'
import { getRenderSpans } from '../../trace-recorder'

async function Spans() {
  // Reading request headers also makes this run at request time, so the
  // reported spans belong to the request.
  await headers()
  return <pre id="spans">{JSON.stringify(getRenderSpans())}</pre>
}

export default function Page() {
  return (
    <Suspense>
      <Spans />
    </Suspense>
  )
}
