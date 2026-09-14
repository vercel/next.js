import { Suspense } from 'react'
import { io } from 'next/cache'
import { getSentinelValue } from '../getSentinelValue'

export default function Page() {
  return (
    <>
      <p>
        This page uses io() inside a Suspense boundary. With cache components
        the content after io() should be dynamic and rendered at request time,
        not during the build prerender.
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
