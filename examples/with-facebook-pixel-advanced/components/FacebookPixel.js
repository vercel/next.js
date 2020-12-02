import { useEffect } from 'react'
import { useRouter } from 'next/router'
import * as fbq from '../utils/fpixel'

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

  const handleRouteChange = () => {
    fbq.pageview()
  }

  return children
}

export default FacebookPixel
