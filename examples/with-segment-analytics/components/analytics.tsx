'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { AnalyticsBrowser } from '@segment/analytics-next'

// This write key is associated with https://segment.com/nextjs-example/sources/nextjs.
const DEFAULT_WRITE_KEY = 'NPsk1GimHq09s7egCUlv7D0tqtUAU5wa'

export const analytics = AnalyticsBrowser.load({
  writeKey: process.env.NEXT_PUBLIC_SEGMENT_WRITE_KEY || DEFAULT_WRITE_KEY,
})

export default function Analytics() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    analytics.page()
  }, [pathname, searchParams])

  return null
}
