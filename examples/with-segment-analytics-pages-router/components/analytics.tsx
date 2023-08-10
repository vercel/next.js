import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { analytics } from '@/lib/segment'

export default function Analytics() {
  const router = useRouter()

  useEffect(() => {
    analytics.page()

    const handleRouteChange = () => {
      analytics.page()
    }

    router.events.on('routeChangeComplete', handleRouteChange)

    return () => {
      router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [])

  return null
}
