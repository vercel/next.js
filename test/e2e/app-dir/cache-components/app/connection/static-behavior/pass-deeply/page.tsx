import { Suspense } from 'react'
import { connection } from 'next/server'

import { getSentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  const pendingConnection = connection()
  return (
    <section>
      <h1>Deep Connection Reader</h1>
      <p>
        This component was passed the connection promise returned by
        `connection()`. It is rendered inside a Suspense boundary.
      </p>
      <p>
        If cacheComponents is turned off the `connection()` call would trigger a
        dynamic point at the callsite and the suspense boundary would also be
        blocked for over one second
      </p>
      <Suspense
        fallback={
          <>
            <p>loading connection...</p>
            <div id="fallback">{getSentinelValue()}</div>
          </>
        }
      >
        <DeepConnectionReader pendingConnection={pendingConnection} />
      </Suspense>
    </section>
  )
}

async function DeepConnectionReader({
  pendingConnection,
}: {
  pendingConnection: ReturnType<typeof connection>
}) {
  await pendingConnection
  return (
    <>
      <p>The connection was awaited</p>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}
