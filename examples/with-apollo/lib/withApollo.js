import { createWithApollo } from './nextApollo'
import { ApolloClient } from 'apollo-client'
import { InMemoryCache } from 'apollo-cache-inmemory'
import { HttpLink } from 'apollo-link-http'
import fetch from 'isomorphic-unfetch'

const withApollo = createWithApollo((apolloState, pageContext) => {
  // The `pageContext` will only be present on the server.
  // use it to extract auth headers or similar.
  return new ApolloClient({
    ssrMode: Boolean(pageContext),
    link: new HttpLink({
      uri: 'https://api.graph.cool/simple/v1/cixmkt2ul01q00122mksg82pn', // Server URL (must be absolute)
      credentials: 'same-origin', // Additional fetch() options like `credentials` or `headers`
      fetch,
    }),
    cache: new InMemoryCache().restore(apolloState),
  })
})

export default withApollo
