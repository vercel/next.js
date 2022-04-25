import { Suspense } from 'react'
import { RelayEnvironmentProvider } from 'react-relay/hooks'

import { useRelayEnvironment } from '../lib/relay'

export default function App({ Component, pageProps }) {
  const relayEnvironment = useRelayEnvironment(pageProps)

  return (
    <RelayEnvironmentProvider environment={relayEnvironment}>
      <Suspense fallback={'Loading...'}>
        <Component {...pageProps} />
      </Suspense>
    </RelayEnvironmentProvider>
  )
}
