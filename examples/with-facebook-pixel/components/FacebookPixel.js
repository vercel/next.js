import { useEffect } from 'react'
import { useRouter } from 'next/router'
import * as fbq from '../lib/fpixel'

const handleRouteChange = () => {
  fbq.pageview()
}

const FacebookPixel = ({ children }) => {
  const router = useRouter()

  useEffect(() => {
    // This pageview only trigger first time (it is important for Pixel to have real information)
    fbq.pageview()

    router.events.on('routeChangeComplete', handleRouteChange)
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [router.events])

  return children
}

export default FacebookPixel
