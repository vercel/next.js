import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { initGA, logPageView } from '../utils/analytics'

const MyApp = ({ Component, pageProps }) => {
  const router = useRouter()

  useEffect(() => {
    initGA()
    // workaround for the issue #11639
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
