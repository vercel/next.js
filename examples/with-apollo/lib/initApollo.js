import ApolloClient from 'apollo-client'
import Link from 'apollo-link-http'
import Cache from 'apollo-cache-inmemory'
import fetch from 'isomorphic-fetch'

let apolloClient = null
let apolloCache = null

// Polyfill fetch() on the server (used by apollo-client)
if (!process.browser) {
  global.fetch = fetch
}

function create(initialState) {
  return new ApolloClient({
    link: new Link({
      uri: 'https://api.graph.cool/simple/v1/cixmkt2ul01q00122mksg82pn'
    }),
    cache: new Cache().restore(initialState || {}),
    ssrMode: !process.browser // Disables forceFetch on the server (so queries are only run once)
  })
}

export default function initApollo(initialState) {
  // Make sure to create a new client for every server-side request so that data
  // isn't shared between connections (which would be bad)
  if (!process.browser) {
    return create(initialState)
  }

  // Reuse client on the client-side
  if (!apolloClient) {
    apolloClient = create(initialState)
  }

  return apolloClient
}
