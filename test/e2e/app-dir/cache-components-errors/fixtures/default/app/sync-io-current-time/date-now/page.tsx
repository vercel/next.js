import { Suspense } from 'react'

export default async function Page() {
  return (
    <>
      <p>
        This page accesses the current time `Date.now()` in a Server Component
        which is an error unless preceded by something else dynamic
      </p>
      <Suspense fallback="loading...">
        <DateReadingComponent />
      </Suspense>
    </>
  )
}

async function DateReadingComponent() {
  await new Promise((r) => process.nextTick(r))
  return <div>{Date.now()}</div>
}
