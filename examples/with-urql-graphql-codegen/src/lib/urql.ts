import { useMemo } from 'react';
import {
  createClient,
  dedupExchange,
  cacheExchange,
  fetchExchange,
  ssrExchange,
  Client
} from 'urql';

let urqlClient: Client;

const isServer = typeof window === 'undefined';

let ssr = ssrExchange({
  isClient: !isServer,
  initialState: undefined
});

const createUrqlClient = (data: any) => {
  ssr = ssrExchange({
    isClient: !isServer,
    initialState: data
  });
  return createClient({
    exchanges: [dedupExchange, cacheExchange, ssr, fetchExchange],
    url: 'https://rickandmortyapi.com/graphql'
  });
};

export const getClient = () => {
  const _urqlClient = urqlClient ?? createUrqlClient(ssr.extractData());

  if (typeof window === 'undefined') return _urqlClient;
  if (!urqlClient) urqlClient = _urqlClient;

  return _urqlClient;
};

export const useUrql = () => {
  const store = useMemo(() => getClient(), []);
  return store;
};
