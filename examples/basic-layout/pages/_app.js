import { useEffect } from 'react'
import { useRouter } from 'next/router'

function MyApp({ Layout, layoutProps, Component, pageProps }) {
  console.log('RENDERING MYAPP')

  const router = useRouter()

  useEffect(() => {
    const handleRouteChange = (url, { shallow }) => {
      console.log(
        `App is changing to ${url} ${
          shallow ? 'with' : 'without'
        } shallow routing`
      )
    }

    router.events.on('routeChangeStart', handleRouteChange)
    router.events.on('routeChangeError', console.error)

    // If the component is unmounted, unsubscribe
    // from the event with the `off` method:
    return () => {
      router.events.off('routeChangeStart', handleRouteChange)
    }
  }, [])

  if (!Layout) {
    return 'INVALID LAYOUT!'
  }

  return (
    <Layout {...layoutProps}>
      <Component {...pageProps} />
    </Layout>
  )
}

export default MyApp
