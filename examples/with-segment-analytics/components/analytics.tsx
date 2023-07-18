'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

import { useSegment } from "@/hooks/useSegment"

export default function Analytics() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const analytics = useSegment()

  useEffect(() => {
    analytics.page()
  }, [pathname, searchParams])

  return null
}