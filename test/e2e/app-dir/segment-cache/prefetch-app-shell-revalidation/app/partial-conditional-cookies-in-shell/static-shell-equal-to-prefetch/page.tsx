import { ConditionalCookies } from '../../../cached-value'
import { Suspense } from 'react'
import { connection } from 'next/server'

export default async function Page() {
  return (
    <main>
      <h1>Partial page that conditionally uses cookies in the shell</h1>
      <ConditionalCookies />
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
