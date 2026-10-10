import { Suspense } from 'react'
import { ClientDynamic } from './client'

export default function Page() {
  return (
    <Suspense fallback={<p id="client-gate-pending">Loading client gate...</p>}>
      <ClientDynamic />
    </Suspense>
  )
}
