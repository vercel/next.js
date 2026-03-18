import { Suspense } from 'react'
import { Static, Runtime, Dynamic } from '../shared'

export default async function Page() {
  return (
    <main>
      <Static label="page" />
      <Suspense fallback="Loading...">
        <Runtime label="page" />
      </Suspense>
      <Suspense fallback="Loading...">
        <Dynamic label="page" />
      </Suspense>
    </main>
  )
}
