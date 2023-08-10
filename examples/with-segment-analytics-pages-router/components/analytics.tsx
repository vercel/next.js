import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { analytics } from '@/lib/segment'

export default function Analytics() {
  const { asPath } = useRouter()

  useEffect(() => {
    analytics.page()
  }, [asPath])

  return null
}
