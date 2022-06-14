import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

import { GA_TRACKING_ID, pageview } from '../lib/gtags'

function MyApp({ Component, pageProps }: AppProps) {
  // google analyticsの設定
  const router = useRouter()

  useEffect(() => {
    if (!GA_TRACKING_ID) return

    const handleRouteChange = (url: string) => {
      pageview(url)
    }
    router.events.on('routeChangeComplete', handleRouteChange)
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [router.events])

  return <Component {...pageProps} />
}

export default MyApp
