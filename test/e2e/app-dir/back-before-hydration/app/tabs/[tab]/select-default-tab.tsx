'use client'

import { useLayoutEffect } from 'react'
import { useRouter } from 'next/navigation'

// Navigates while hydrating, before the router's own effects have run.
export function SelectDefaultTab() {
  const router = useRouter()
  useLayoutEffect(() => {
    router.replace('/tabs/first')
  }, [router])
  return null
}
