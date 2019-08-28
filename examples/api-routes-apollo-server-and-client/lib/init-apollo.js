import ApolloClient from 'apollo-client'
import { SchemaLink } from 'apollo-link-schema'
import { InMemoryCache } from 'apollo-cache-inmemory'
import { HttpLink } from 'apollo-link-http'
import { schema } from '../apollo/schema'
import gql from 'graphql-tag'

let apolloClient = null

function create (initialState) {
  // Check out https://github.com/zeit/next.js/pull/4611 if you want to use the AWSAppSyncClient
  const isBrowser = typeof window !== 'undefined'

  const link = isBrowser
    ? new HttpLink({
      uri: '/api/graphql',
      credentials: 'same-origin'
    })
    : new SchemaLink({ schema })

  const cache = new InMemoryCache().restore(initialState || {})

  return new ApolloClient({
    connectToDevTools: isBrowser,
    ssrMode: !isBrowser, // Disables forceFetch on the server (so queries are only run once)
    link,
    typeDefs: gql`
      extend type User {
        status: String!
      }
    `,
    resolvers: {
      User: {
        status () {
          return 'cached'
        }
      }
    },
    cache
  })
}

export default function initApollo (initialState) {
  // Make sure to create a new client for every server-side request so that data
  // isn't shared between connections (which would be bad)
  if (typeof window === 'undefined') {
    return create(initialState)
  }

  // Reuse client on the client-side
  if (!apolloClient) {
    apolloClient = create(initialState)
  }

  return apolloClient
}
