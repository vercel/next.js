import { ApolloProvider } from '@apollo/client'
import { useApollo } from '../apollo/client'
import globalStyles from '../styles/global'

export default function MyApp({ Component, pageProps }) {
  const apolloClient = useApollo(pageProps.initialApolloState)
  return (
    <ApolloProvider client={apolloClient}>
      <Component {...pageProps} />
      <style jsx global>
        {globalStyles}
      </style>
    </ApolloProvider>
  )
}
