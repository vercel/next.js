import { GraphQLClient } from 'graphql-hooks'
import memCache from 'graphql-hooks-memcache'
import unfetch from 'isomorphic-unfetch'
import { NormalizedCacheObject } from "apollo-cache-inmemory";

let graphQLClient: GraphQLClient | null = null

function create (initialState = {}) {
  return new GraphQLClient({
    ssrMode: typeof window === 'undefined',
    url: 'https://api.graph.cool/simple/v1/cixmkt2ul01q00122mksg82pn',
    cache: memCache({ initialState }),
    fetch: typeof window !== 'undefined' ? fetch.bind({}) : unfetch, // eslint-disable-line
  })
}

export default function initGraphQL (initialState: NormalizedCacheObject) {
  // Make sure to create a new client for every server-side request so that data
  // isn't shared between connections (which would be bad)
  if (typeof window === 'undefined') {
    return create(initialState)
  }

  // Reuse client on the client-side
  if (!graphQLClient) {
    graphQLClient = create(initialState)
  }

  return graphQLClient
}
