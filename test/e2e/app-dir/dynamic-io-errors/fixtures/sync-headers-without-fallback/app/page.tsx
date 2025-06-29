import { Suspense } from 'react'
import { headers, type UnsafeUnwrappedHeaders } from 'next/headers'

import { IndirectionOne, IndirectionTwo, IndirectionThree } from './indirection'

export default async function Page() {
  return (
    <>
      <p>
        This page accesses headers synchronously and it triggers dynamic before
        another component is finished which doesn't define a fallback UI with
        Suspense. This is considered a build error and the message should
        clearly indicate that it was caused by a synchronous dynamic API usage.
      </p>
      <Suspense fallback={<Fallback />}>
        <IndirectionOne>
          <HeadersReadingComponent />
        </IndirectionOne>
      </Suspense>
      <IndirectionTwo>
        <LongRunningComponent />
      </IndirectionTwo>
      <IndirectionThree>
        <ShortRunningComponent />
      </IndirectionThree>
    </>
  )
}

async function HeadersReadingComponent() {
  await new Promise((r) => process.nextTick(r))
  const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
    'user-agent'
  )

  console.log(
    'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
  )

  return (
    <div>
      this component read the `user-agent` header synchronously: {userAgent}
    </div>
  )
}

async function LongRunningComponent() {
  await new Promise((r) =>
    process.nextTick(async () => {
      await 1
      process.nextTick(r)
    })
  )
  return (
    <div>
      this component took a long time to resolve (but still before the dynamicIO
      cutoff). It might not be done before the sync headers call happens.
    </div>
  )
}

async function ShortRunningComponent() {
  return (
    <div>
      This component runs quickly (in a microtask). It should be finished before
      the sync headers call is triggered.
    </div>
  )
}

function Fallback() {
  return <div data-fallback="">loading...</div>
}
