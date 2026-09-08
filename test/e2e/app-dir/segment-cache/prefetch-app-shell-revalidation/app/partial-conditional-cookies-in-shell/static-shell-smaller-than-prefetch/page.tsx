import { ConditionalCookies } from '../../../cached-value'
import { Suspense } from 'react'
import { connection } from 'next/server'
import { unstable_prefetch } from 'next/cache'

export default async function Page() {
  return (
    <main>
      <h1>
        Partial page that conditionally uses cookies in the shell, but also has
        prefetch-only content
      </h1>
      <ConditionalCookies />
      <Suspense
        fallback={
          <div id="prefetch-data-fallback">Loading prefetch data...</div>
        }
      >
        <PrefetchData />
      </Suspense>
      <Suspense
        fallback={<div id="dynamic-data-fallback">Loading dynamic data...</div>}
      >
        <DynamicData />
      </Suspense>
    </main>
  )
}

async function DynamicData() {
  await connection()
  return <div id="dynamic-data">Dynamic data</div>
}
async function PrefetchData() {
  await unstable_prefetch()
  return <div id="prefetch-data">Prefetch data</div>
}
