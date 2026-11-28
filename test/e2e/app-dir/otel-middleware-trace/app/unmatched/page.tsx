import { connection } from 'next/server'
import { Suspense } from 'react'
import { getActiveTraceId } from '../../trace-recorder'

async function TraceId() {
  // Run at request time so the reported trace is the request's.
  await connection()
  return <pre id="trace-id">{getActiveTraceId()}</pre>
}

// Not matched by the middleware: a baseline for requests without middleware.
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
