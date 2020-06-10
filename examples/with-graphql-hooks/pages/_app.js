import { ClientContext } from 'graphql-hooks'
import { useGraphQLClient } from '../lib/graphql-client'

export default function App({ Component, pageProps }) {
  const graphQLClient = useGraphQLClient(pageProps.initialGraphQLState)

  return (
    <ClientContext.Provider value={graphQLClient}>
      <Component {...pageProps} />
    </ClientContext.Provider>
  )
}
