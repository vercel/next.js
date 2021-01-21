import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client'
import { concatPagination } from '@apollo/client/utilities'
import { useMemo } from 'react'

let apolloClient

function createApolloClient(registerCache, initialState) {
  const cache = new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          allPosts: concatPagination(),
        },
      },
    },
  }).restore(initialState || {});

  if (registerCache) {
    registerCache(cache);
  }

  const link = new HttpLink({
    uri: 'https://nextjs-graphql-with-prisma-simple.vercel.app/api', // Server URL (must be absolute)
    credentials: 'same-origin', // Additional fetch() options like `credentials` or `headers`
  })
  
  return new ApolloClient({
    ssrMode: typeof window === 'undefined',
    link,
    cache
  })
}

export function initializeApollo(registerCache, initialState) {
  const _apolloClient = apolloClient ?? createApolloClient(registerCache, initialState)

  // For SSG and SSR always create a new Apollo Client
  if (typeof window === 'undefined') return _apolloClient

  // Create the Apollo Client once in the client
  if (!apolloClient) apolloClient = _apolloClient

  return _apolloClient
}


export function useApollo(registerCache, initialState) {
  const store = useMemo(() => initializeApollo(registerCache, initialState), [registerCache, initialState])
  return store
}
