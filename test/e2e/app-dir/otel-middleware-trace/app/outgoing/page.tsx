import { headers } from 'next/headers'
import { Suspense } from 'react'

async function Outgoing() {
  // An outgoing request of the render, at request time: its `tracestate`
  // (echoed by `/tracestate-echo`) and the render's own request headers.
  const requestHeaders = await headers()
  const host = requestHeaders.get('host')
  const proto = requestHeaders.get('x-forwarded-proto') ?? 'http'
  const res = await fetch(`${proto}://${host}/tracestate-echo`, {
    cache: 'no-store',
  })
  const { tracestate } = await res.json()
  return (
    <>
      <pre id="outgoing-tracestate">{JSON.stringify(tracestate)}</pre>
      <pre id="request-tracestate">
        {JSON.stringify(requestHeaders.get('tracestate'))}
      </pre>
    </>
  )
}

export default function Page() {
  return (
    <Suspense>
      <Outgoing />
    </Suspense>
  )
}
