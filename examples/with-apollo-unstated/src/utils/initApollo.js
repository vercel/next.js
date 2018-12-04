import 'isomorphic-unfetch'
import { ApolloClient, InMemoryCache, HttpLink } from 'apollo-boost'

let apolloClient = null

//create apollo client
const getClient = (initialState) =>
  new ApolloClient({
    link: new HttpLink({
      uri: 'https://w5xlvm3vzz.lp.gql.zone/graphql', //Server URL (must be absolute)
      credentials: 'same-origin', //Additional fetch() options like `credential` or `headers`
    }),
    ssrMode: !process.browser, // Disables forceFetch on the server (so queries are only run once)
    connectToDevTools: process.browser,
    cache: new InMemoryCache().restore(initialState || {}),
  })

export const initApollo = (initialState) => {
  // Make sure to create a new client for every server-side request so that data
  // isn't shared between connections (which would be bad)
  if (!process.browser) {
    return getClient(initialState)
  }

  // Reuse client on the client-side
  if (!apolloClient) {
    apolloClient = getClient(initialState)
  }

  return apolloClient
}
