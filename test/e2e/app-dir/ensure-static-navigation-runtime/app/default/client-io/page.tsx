import { Suspense } from 'react'
import { Timestamp } from '../../../components/timestamp'
import { ClientIO } from './client'

export const unstable_ensureStatic = 'navigation'

export default function Page() {
  return (
    <main>
      <Timestamp />
      <p>
        This page does not use any params, and should be fully static despite
        having client-only IO.
      </p>
      <Suspense
        fallback={<p id="client-io-fallback">Fallback for client-only IO</p>}
      >
        <ClientIO />
      </Suspense>
    </main>
  )
}
