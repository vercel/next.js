import { ApolloProvider } from '@apollo/react-hooks'
import { initializeApollo } from '../lib/RealmClient'

export default function App({ Component, pageProps }) {
  const apolloClient = initializeApollo(pageProps.initialApolloState)
  return (
    <ApolloProvider client={apolloClient}>
      <Component {...pageProps} />
    </ApolloProvider>
  )
}
