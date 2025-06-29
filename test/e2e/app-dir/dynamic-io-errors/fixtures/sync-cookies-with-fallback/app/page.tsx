import { Suspense } from 'react'
import { cookies, type UnsafeUnwrappedCookies } from 'next/headers'

import { IndirectionOne, IndirectionTwo, IndirectionThree } from './indirection'

export default async function Page() {
  return (
    <>
      <p>
        This page accesses cookies synchronously but it does so late enough in
        the render that all unfinished sub-trees have a defined Suspense
        boundary. This is fine and doesn't need to error the build.
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
  const token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')

  console.log(
    'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
  )

  return (
    <div>
      this component read the `token` cookie synchronously: {token?.value}
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
