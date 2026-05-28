import { Suspense } from 'react'
import { io } from 'next/cache'
import { getSentinelValue } from '../getSentinelValue'

export default function Page() {
  return (
    <>
      <p>
        This page uses io() inside a Suspense boundary. Without cache components
        io() is a no-op during prerendering so the entire page should be fully
        static.
      </p>
      <div id="before">{getSentinelValue()}</div>
      <Suspense fallback={<div id="fallback">loading...</div>}>
        <DynamicComponent />
      </Suspense>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

async function DynamicComponent() {
  await io()
  return <div id="after-io">{getSentinelValue()}</div>
}
