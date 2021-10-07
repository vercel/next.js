import 'styles/globals.css'

import type { AppProps } from 'next/app'
import { ApolloProvider } from '@apollo/client'
import { useApollo } from 'lib/apollo/apolloClient'

function MyApp({ Component, pageProps }: AppProps) {
  const { client } = useApollo(pageProps)

  // We need to wait for the client side cache to be restored before rendering
  // the application
  if (!client) {
    return <div>Initializing...</div>
  }

  return (
    <ApolloProvider client={client}>
      <div style={{ padding: 15 }}>
        <Component {...pageProps} />
      </div>
    </ApolloProvider>
  )
}

export default MyApp
