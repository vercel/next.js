import { useMemo } from 'react'
import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  NormalizedCacheObject,
} from '@apollo/client'
import { SchemaLink } from '@apollo/client/link/schema'
import { schema } from '../apollo/schema'
import merge from 'deepmerge'

let apolloClient: ApolloClient<NormalizedCacheObject> | undefined

function createIsomorphLink() {
  if (typeof window === 'undefined') {
    return new SchemaLink({ schema })
  } else {
    return new HttpLink({
      uri: '/api/graphql',
      credentials: 'same-origin',
    })
  }
}

function createApolloClient() {
  return new ApolloClient({
    ssrMode: typeof window === 'undefined',
    link: createIsomorphLink(),
    cache: new InMemoryCache(),
  })
}

export function initializeApollo(
  initialState: NormalizedCacheObject | null = null
) {
  const _apolloClient = apolloClient ?? createApolloClient()

  // If your page has Next.js data fetching methods that use Apollo Client, the initial state
  // gets hydrated here
  if (initialState) {
    // Get existing cache, loaded during client side data fetching
    const existingCache = _apolloClient.extract()

    // Overwrites the existing array values completely rather than concatenating them
    // merge([1, 2, 3], [3, 2, 1], { arrayMerge: overwriteMerge }) => [3, 2, 1]
    const overwriteMerge: merge.Options['arrayMerge'] = (
      target,
      sourceArray,
      options
    ) => sourceArray

    // Merge the existing cache into data passed from getStaticProps/getServerSideProps
    const data = merge(initialState, existingCache, {
      arrayMerge: overwriteMerge,
    })

    // Restore the cache with the merged data
    _apolloClient.cache.restore(data)
  }
  // For SSG and SSR always create a new Apollo Client
  if (typeof window === 'undefined') return _apolloClient
  // Create the Apollo Client once in the client
  if (!apolloClient) apolloClient = _apolloClient

  return _apolloClient
}

export function useApollo(initialState: NormalizedCacheObject) {
  const store = useMemo(() => initializeApollo(initialState), [initialState])
  return store
}
