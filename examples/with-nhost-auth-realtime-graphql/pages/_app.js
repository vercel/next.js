import { NhostAuthProvider } from '@nhost/react-auth'
import { NhostApolloProvider } from '@nhost/react-apollo'

import { nhost } from '../utils/nhost'

function MyApp({ Component, pageProps }) {
  return (
    <NhostAuthProvider auth={nhost.auth}>
      <NhostApolloProvider
        auth={nhost.auth}
        gqlEndpoint={process.env.NEXT_PUBLIC_GRAPHQL_URL}
      >
        <Component {...pageProps} />
      </NhostApolloProvider>
    </NhostAuthProvider>
  )
}

export default MyApp
