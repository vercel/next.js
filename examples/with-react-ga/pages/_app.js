import App from 'next/app'
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { initGA, logPageView } from '../utils/analytics'

const App = ({ Component, pageProps }) => {
  const router = useRouter()

  useEffect(() => {
    initGA()

    // workaround for the issue #11639
    if (!router.asPath.includes('?')) {
      logPageView()
    }
  }, [])

  useEffect(() => {
    router.events.on('routeChangeComplete', logPageView)

    return () => {
      router.events.off('routeChangeComplete', logPageView)
    }
  }, [router.events])

  return <Component {...pageProps} />
}

export default App
