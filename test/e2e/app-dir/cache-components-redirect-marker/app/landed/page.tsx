'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// Simulates the auth provider recovering the session client-side and
// returning the user to the page they were on.
export default function Landed() {
  const router = useRouter()
  useEffect(() => {
    document.cookie = 'session=recovered; path=/'
    router.replace('/a')
  }, [router])
  return <p>Recovering session…</p>
}
