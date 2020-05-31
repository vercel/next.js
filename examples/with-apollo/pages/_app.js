import { ApolloProvider } from '@apollo/react-hooks'
import createApolloClient from '../apolloClient'

export default function App({ Component, pageProps }) {
  const apolloClient = createApolloClient(pageProps.initialApolloState)

  return (
    <ApolloProvider client={apolloClient}>
      <Component {...pageProps} />
    </ApolloProvider>
  )
}
