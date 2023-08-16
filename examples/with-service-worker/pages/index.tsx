import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) =>
        console.log(
          'Service Worker registration successful with scope: ',
          registration.scope
        )
      )
      .catch((err) => console.log('Service Worker registration failed: ', err))
  }, [])

  return <h1>with-service-worker</h1>
}
