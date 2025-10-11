import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

// Technically, no `export const unstable_prefetch = ...` is needed, because we default to static,
// this is just to make sure that we excercise the codepaths for it
export const unstable_prefetch = {
  mode: 'static',
}
export default function Page() {
  return (
    <main>
      <h1 style={{ color: 'green' }}>Statically prefetchable</h1>
      <p id="static-content-page">
        This page is a child of a runtime-prefetchable layout that is not
        configured as runtime-prefetchable. We should not use a runtime prefetch
        for it.
      </p>
      <Suspense fallback="Loading...">
        <RuntimePrefetchable />
      </Suspense>
      <Suspense fallback="Loading...">
        <DynamicContent />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable() {
  await cookies()
  return (
    <div id="runtime-prefetchable-content-page">
      Runtime-prefetchable content from page
    </div>
  )
}

async function DynamicContent() {
  await connection()
  return <div id="dynamic-content-page">Dynamic Content from page</div>
}
