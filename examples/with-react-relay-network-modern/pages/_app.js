import { RelayEnvironmentProvider } from 'relay-hooks'

import { createEnvironment } from '../lib/createEnvironment'

export default function App({ Component, pageProps }) {
  return (
    <RelayEnvironmentProvider
      environment={
        pageProps.environment || createEnvironment(pageProps.relayData)
      }
    >
      <Component {...pageProps} />
    </RelayEnvironmentProvider>
  )
}
