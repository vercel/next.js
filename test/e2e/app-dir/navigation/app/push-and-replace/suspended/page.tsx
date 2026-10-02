'use client'

import { use } from 'react'

const forever = new Promise<never>(() => {})

export default function Page() {
  if (typeof window !== 'undefined') {
    // Suspend the navigation transition forever so it never commits.
    use(forever)
  }
  return null
}
