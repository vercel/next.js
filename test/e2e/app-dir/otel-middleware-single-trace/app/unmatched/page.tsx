import { connection } from 'next/server'
import { Suspense } from 'react'
import { getRenderSpans } from '../../trace-recorder'

async function Spans() {
  // Run at request time so the reported spans belong to the request.
  await connection()
  return <pre id="spans">{JSON.stringify(getRenderSpans())}</pre>
}

// Not matched by the middleware: a baseline for requests without middleware.
export default function Page() {
  return (
    <Suspense>
      <Spans />
    </Suspense>
  )
}
