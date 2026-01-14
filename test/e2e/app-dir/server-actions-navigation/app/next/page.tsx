'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NextPage() {
  const router = useRouter()
  const didRefreshRef = useRef(false)
  const [refreshed, setRefreshed] = useState(false)

  useEffect(() => {
    // Prevent refresh loop after router.refresh()
    if (didRefreshRef.current) return

    const timer = setTimeout(() => {
      didRefreshRef.current = true
      router.refresh()
      setRefreshed(true)
    }, 4000)

    return () => clearTimeout(timer)
  }, [router])

  return (
    <div>
      <div id="next-page">Next page</div>
      <div id="result">{refreshed ? 'REFRESHED_OK' : 'NOT_REFRESHED'}</div>
    </div>
  )
}
