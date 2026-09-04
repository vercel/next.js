import { ConditionalCookies } from '../../cached-value'
import { Suspense } from 'react'
import { connection } from 'next/server'
import { unstable_prefetch } from 'next/cache'

export default async function Page() {
  return (
    <main>
      <h1>Partial page that conditionally uses cookies in the prefetch</h1>
      <Suspense
        fallback={
          <div id="prefetch-data-fallback">Loading prefetch data...</div>
        }
      >
        <PrefetchOnly>
          <div id="prefetch-data">Prefetch data</div>
          <ConditionalCookies />
        </PrefetchOnly>
      </Suspense>
      <Suspense
        fallback={<div id="dynamic-data-fallback">Loading dynamic data...</div>}
      >
        <DynamicData />
      </Suspense>
    </main>
  )
}

async function PrefetchOnly({ children }) {
  await unstable_prefetch()
  return children
}

async function DynamicData() {
  await connection()
  return <div id="dynamic-data">Dynamic data</div>
}
