'use client'

import { revalidateSelf } from './action'

export default function Page() {
  if (typeof window === 'undefined') {
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      throw new Error('app:self-revalidate')
    }
  }
  return (
    <button
      onClick={() => {
        revalidateSelf()
        location.reload()
      }}
    >
      revalidate
    </button>
  )
}
