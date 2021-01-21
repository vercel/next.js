import { ApolloProvider } from '@apollo/client'
import { useApollo } from '../lib/apolloClient'
import withApolloServerSideRender from '../lib/withApolloServerSideRender'
import { useApolloCacheControl } from '../lib/useApolloCacheControl'

function App({ Component, pageProps }) {
  const ApolloCacheControl = useApolloCacheControl()
  const registerCache = (cache) =>
    ApolloCacheControl.registerCache('cache-1', cache)
  const initialState = ApolloCacheControl.getExtractedCache('cache-1')

  const apolloClient = useApollo(registerCache, initialState)

  return (
    <ApolloProvider client={apolloClient}>
      <Component {...pageProps} />
    </ApolloProvider>
  )
}

export default withApolloServerSideRender(App)
