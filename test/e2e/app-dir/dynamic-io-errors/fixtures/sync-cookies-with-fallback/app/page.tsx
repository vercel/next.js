import { Suspense } from 'react'
import { cookies, type UnsafeUnwrappedCookies } from 'next/headers'

import { IndirectionOne, IndirectionTwo, IndirectionThree } from './indirection'

export default async function Page() {
  return (
    <>
      <p>
        This page access cookies synchronously and it triggers dynamic before
        another component is finished which doesn't define a fallback UI with
        Suspense. This is considered a build error and the message should
        clearly indicate that it was caused by a synchronous dynamic API usage.
      </p>
      <Suspense fallback={<Fallback />}>
        <IndirectionOne>
          <CookiesReadingComponent />
        </IndirectionOne>
      </Suspense>
      <Suspense fallback={<Fallback />}>
        <IndirectionTwo>
          <LongRunningComponent />
        </IndirectionTwo>
      </Suspense>
      <IndirectionThree>
        <ShortRunningComponent />
      </IndirectionThree>
    </>
  )
}

async function CookiesReadingComponent() {
  await new Promise((r) => process.nextTick(r))
  const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
  return <div>this component read the `token` cookie synchronously</div>
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
      cutoff). It might not be done before the sync cookies call happens.
    </div>
  )
}

async function ShortRunningComponent() {
  return (
    <div>
      This component runs quickly (in a microtask). It should be finished before
      the sync cookies call is triggered.
    </div>
  )
}

function Fallback() {
  return <div data-fallback="">loading...</div>
}
