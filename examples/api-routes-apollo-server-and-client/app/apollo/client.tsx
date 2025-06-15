// lib/apollo/client.ts
import { useMemo } from 'react';
import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';
import { SchemaLink } from '@apollo/client/link/schema';
import { schema } from './schema';

let apolloClient: ApolloClient<any>;

function createIsomorphLink() {
  if (typeof window === 'undefined') {
    return new SchemaLink({ schema }); // For SSR
  } else {
    return new HttpLink({
      uri: '/api/graphql',  // Apollo GraphQL endpoint
      credentials: 'same-origin',
    });
  }
}

function createApolloClient() {
  return new ApolloClient({
    ssrMode: typeof window === 'undefined',  // SSR mode if on the server
    link: createIsomorphLink(),
    cache: new InMemoryCache(),
  });
}

export function initializeApollo(initialState = null) {
  const _apolloClient = apolloClient ?? createApolloClient();

  // Merge initial state from SSR into the Apollo client cache
  if (initialState) {
    const existingCache = _apolloClient.extract();
    const data = { ...existingCache, ...initialState };
    _apolloClient.cache.restore(data);
  }

  // Ensure that we only create Apollo Client once on the client-side
  if (typeof window === 'undefined') return _apolloClient;
  if (!apolloClient) apolloClient = _apolloClient;

  return _apolloClient;
}

export function useApollo() {
  return useMemo(() => initializeApollo(), []);  // Return initialized Apollo Client
}
