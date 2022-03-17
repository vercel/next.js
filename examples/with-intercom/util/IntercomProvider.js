import { useEffect } from 'react'
import { useRouter } from 'next/router'
import {
  load as loadIntercom,
  boot as bootIntercom,
  update as updateIntercom,
} from './intercom'

export const IntercomProvider = ({ children }) => {
  const router = useRouter()

  if (typeof window !== 'undefined') {
    loadIntercom()
    bootIntercom()
  }

  useEffect(() => {
    const handleRouteChange = (url) => {
      if (typeof window !== 'undefined') {
        updateIntercom()
      }
    }

    router.events.on('routeChangeStart', handleRouteChange)

    // If the component is unmounted, unsubscribe
    // from the event with the `off` method:
    return () => {
      router.events.off('routeChangeStart', handleRouteChange)
    }
  }, [router.events])

  return children
}
