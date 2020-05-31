import { ApolloProvider } from '@apollo/react-hooks'
import { Provider } from 'react-redux'
import { createApolloClient } from '../lib/apollo'
import { useStore } from '../store'

export default function App({ Component, pageProps }) {
  const apolloClient = createApolloClient()
  const store = useStore(pageProps.initialReduxState)

  return (
    <ApolloProvider client={apolloClient}>
      <Provider store={store}>
        <Component {...pageProps} />
      </Provider>
    </ApolloProvider>
  )
}
