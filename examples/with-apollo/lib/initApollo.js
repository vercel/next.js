import { ApolloClient } from 'apollo-boost'
import { HttpLink } from 'apollo-boost'
import { InMemoryCache } from 'apollo-boost'
import 'isomorphic-unfetch'

let apolloClient = null

function create(initialState) {
  return new ApolloClient({
    connectToDevTools: process.browser === true,
    ssrMode: process.browser === undefined, // Disables forceFetch on the server (so queries are only run once)
    link: new HttpLink({
      uri: 'https://api.graph.cool/simple/v1/cixmkt2ul01q00122mksg82pn', // Server URL (must be absolute)
      credentials: 'same-origin' // Additional fetch() options like `credentials` or `headers`
    }),
    cache: new InMemoryCache().restore(initialState || {})
  })
}

export default function initApollo(initialState) {
  // Make sure to create a new client for every server-side request so that data
  // isn't shared between connections (which would be bad)
  if (process.browser === undefined) {
    return create(initialState)
  }

  // Reuse client on the client-side
  if (apolloClient === null) {
    apolloClient = create(initialState)
  }

  return apolloClient
}
