import type { AppProps } from 'next/app'
import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const { pathname, asPath, query } = router

  useEffect(() => {
    const handleRouteChangeStart = (url: string) => {
      console.log(
        'event: routeChangeStart, ',
        `url: ${url}, `,
        `asPath: ${asPath}`
      )
    }
    const handleBeforeHistoryChange = (url: string) => {
      console.log(
        'event: beforeHistoryChange, ',
        `url: ${url}, `,
        `asPath: ${asPath}`
      )
    }
    const handleRouteChangeComplete = (url: string) => {
      console.log(
        'event: routeChangeComplete, ',
        `url: ${url}, `,
        `asPath: ${asPath}`
      )
    }
    const handleHashChangeStart = (url: string) => {
      console.log(
        'event: hashChangeStart, ',
        `url: ${url}, `,
        `asPath: ${asPath}`
      )
    }
    const handleHashChangeComplete = (url: string) => {
      console.log(
        'event:hashChangeComplete, ',
        `url: ${url}, `,
        `asPath:${asPath}`
      )
    }
    const handleBeforePopState = ({ url, as }: { url: string; as: string }) => {
      console.log(
        'event: beforePopState, ',
        `url: ${url}, `,
        `as: ${as}, `,
        `asPath: ${asPath}`
      )

      return true
    }

    router.beforePopState(handleBeforePopState)
    router.events.on('routeChangeStart', handleRouteChangeStart)
    router.events.on('routeChangeComplete', handleRouteChangeComplete)
    router.events.on('beforeHistoryChange', handleBeforeHistoryChange)
    router.events.on('hashChangeStart', handleHashChangeStart)
    router.events.on('hashChangeComplete', handleHashChangeComplete)

    return () => {
      router.events.off('routeChangeStart', handleRouteChangeStart)
      router.events.off('routeChangeComplete', handleRouteChangeComplete)
      router.events.off('beforeHistoryChange', handleBeforeHistoryChange)
      router.events.off('hashChangeStart', handleHashChangeStart)
      router.events.off('hashChangeComplete', handleHashChangeComplete)
    }
  }, [router])

  console.log('🟢 render!, ', `asPath: ${asPath}`)

  return <Component {...pageProps} />
}
