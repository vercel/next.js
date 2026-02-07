import { Suspense } from 'react'

export default async function Page() {
  return (
    <>
      <p>
        This page uses `crypto.randomUUID()` in a Server Component which is an
        error unless preceded by something else dynamic
      </p>
      <Suspense fallback="loading...">
        <SyncIOComponent />
      </Suspense>
    </>
  )
}

async function SyncIOComponent() {
  await new Promise((r) => process.nextTick(r))
  return <div>{crypto.randomUUID()}</div>
}
