import { Suspense } from 'react'
import { ClientIO } from './client'

export const ensureStatic = 'navigation'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <ClientIO />
      </Suspense>
    </main>
  )
}
