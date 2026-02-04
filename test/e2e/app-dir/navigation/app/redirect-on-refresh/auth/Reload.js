'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function Reload() {
  const router = useRouter()

  useEffect(() => {
    fetch(new URL('/api/set-token', location.origin), {
      method: 'POST',
      credentials: 'include',
    }).then(() => {
      router.refresh()
    })
  }, [router])

  return null
}
