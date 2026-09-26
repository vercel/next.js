import { Suspense } from 'react'
import { ClientIO } from './client'

export const unstable_ensureStatic = 'navigation'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <ClientIO />
      </Suspense>
    </main>
  )
}
