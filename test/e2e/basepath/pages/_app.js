import { useEffect } from 'react'
import { useRouter } from 'next/router'

// We use session storage for the event log so that it will survive
// page reloads, which happen for instance during routeChangeError
const EVENT_LOG_KEY = 'router-event-log'

function getEventLog() {
  const data = sessionStorage.getItem(EVENT_LOG_KEY)
  return data ? JSON.parse(data) : []
}

function clearEventLog() {
  sessionStorage.removeItem(EVENT_LOG_KEY)
}

function addEvent(data) {
  const eventLog = getEventLog()
  eventLog.push(data)
  sessionStorage.setItem(EVENT_LOG_KEY, JSON.stringify(eventLog))
}

if (typeof window !== 'undefined') {
  // global functions introduced to interface with the test infrastructure
  window._clearEventLog = clearEventLog
  window._getEventLog = getEventLog
}

function useLoggedEvent(event, serializeArgs = (...args) => args) {
  const router = useRouter()
  useEffect(() => {
    const logEvent = (...args) => {
      addEvent([event, ...serializeArgs(...args)])
    }
    router.events.on(event, logEvent)
    return () => router.events.off(event, logEvent)
  }, [event, router.events, serializeArgs])
}

function serializeErrorEventArgs(err, url, properties) {
  return [err.message, err.cancelled, url, properties]
}

export default function MyApp({ Component, pageProps }) {
  useLoggedEvent('routeChangeStart')
  useLoggedEvent('routeChangeComplete')
  useLoggedEvent('routeChangeError', serializeErrorEventArgs)
  useLoggedEvent('beforeHistoryChange')
  useLoggedEvent('hashChangeStart')
  useLoggedEvent('hashChangeComplete')
  return <Component {...pageProps} />
}
