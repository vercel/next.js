import { useEffect } from 'react'
import Router from 'next/router'
import * as gtag from '../lib/gtag'

const App = ({ Component, pageProps }) => {
  useEffect(() => {
    const handleRouteChange = () => {
      gtag.pageview()
    }
    Router.events.on('routeChangeComplete', handleRouteChange)
    return () => {
      Router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [])

  return <Component {...pageProps} />
}

export default App
