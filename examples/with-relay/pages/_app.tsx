import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { RelayEnvironmentProvider } from 'react-relay'

import { useRelayEnvironment } from '../lib/relay'

function MyApp({ Component, pageProps }: AppProps) {
  const relayEnvironment = useRelayEnvironment(pageProps.initialRecords)

  return (
    <RelayEnvironmentProvider environment={relayEnvironment}>
      <Component {...pageProps} />
    </RelayEnvironmentProvider>
  )
}

export default MyApp
