import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { initGA, logPageView } from '../utils/analytics'

const MyApp = ({ Component, pageProps }) => {
  const router = useRouter()

  useEffect(() => {
    initGA()
    // in case of query in the url the routeChangeComplete event is triggered on load too
    if (!router.asPath.includes('?')) {
      logPageView()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    router.events.on('routeChangeComplete', logPageView)
    return () => {
      router.events.off('routeChangeComplete', logPageView)
    }
  }, [router.events])

  return <Component {...pageProps} />
}

export default MyApp
