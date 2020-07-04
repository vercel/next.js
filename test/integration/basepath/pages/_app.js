import { useEffect } from 'react'
import { useRouter } from 'next/router'

let eventLog = []

if (typeof window !== 'undefined') {
  // global functions introduced to interface with the test infrastructure
  window._clearEventLog = () => {
    eventLog = []
  }

  window._getEventLog = () => {
    return eventLog
  }
}

function useLoggedEvent(event, serializeArgs = (...args) => args) {
  const router = useRouter()
  useEffect(() => {
    const logEvent = (...args) =>
      eventLog.push([event, ...serializeArgs(...args)])
    router.events.on(event, logEvent)
    return () => router.events.off(event, logEvent)
  }, [event, router.events, serializeArgs])
}

export default function MyApp({ Component, pageProps }) {
  useLoggedEvent('routeChangeStart')
  useLoggedEvent('routeChangeComplete')
  useLoggedEvent('routeChangeError', (err, url) => [
    err.message,
    err.cancelled,
    url,
  ])
  useLoggedEvent('beforeHistoryChange')
  return <Component {...pageProps} />
}
