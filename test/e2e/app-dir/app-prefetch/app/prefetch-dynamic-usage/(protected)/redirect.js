'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function Redirect() {
  const path = usePathname()
  const router = useRouter()

  useEffect(() => {
    const nextUrl = encodeURIComponent(
      path ? decodeURIComponent(path) : '/search'
    )
    router.push(`/login?nextUrl=${nextUrl}`)
  }, [path, router])

  return null
}
