import type { Instant } from 'next'
import { ClientIO } from './client'

export const ensureStatic = 'navigation'

export const instant: Instant = {
  // We don't care about Instant Validation here,
  // Static Shell Validation should still error.
  unstable_disableValidation: true,
}

export default function Page() {
  return (
    <main>
      <ClientIO />
    </main>
  )
}
