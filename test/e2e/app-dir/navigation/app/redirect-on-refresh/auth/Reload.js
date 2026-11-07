'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function Reload() {
  const router = useRouter()

  useEffect(() => {
    document.cookie = 'token=this%20is%20a%20token; path=/'
    router.refresh()
  }, [router])

  return null
}
