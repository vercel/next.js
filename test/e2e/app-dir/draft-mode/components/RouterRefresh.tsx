'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function RouteRefresher() {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh()
    }, 1000)

    return () => clearInterval(id)
  }, [router])

  return null
}
