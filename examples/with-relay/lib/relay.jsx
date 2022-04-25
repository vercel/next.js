import { useMemo } from 'react'
import { Environment, Network, RecordSource, Store } from 'relay-runtime'

export const RELAY_INITIAL_RECORDS_PROP = '__RELAY_INITIAL_RECORDS__'

let relayEnvironment

// Define a function that fetches the results of an operation (query/mutation/etc)
// and returns its results as a Promise
const fetchRelay = async (operation, variables) => {
  const response = await fetch(process.env.NEXT_PUBLIC_RELAY_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: operation.text,
      variables,
    }),
  })
  return await response.json()
}

const createEnvironment = () =>
  new Environment({
    // Create a network layer from the fetch function
    network: Network.create(fetchRelay),
    store: new Store(new RecordSource()),
  })

// For use in non-react contexts: getServerSideProps, getStaticProps,
// getInitialProps, pages/api routes.
// Should be paired with finalizeRelay() with get*Props() methods.
export const initializeRelay = (initialRecords) => {
  // Create a network layer from the fetch function
  const environment = relayEnvironment ?? createEnvironment()

  // If your page has Next.js data fetching methods that use Relay, the initial records
  // will get hydrated here
  if (initialRecords) {
    environment.getStore().publish(new RecordSource(initialRecords))
  }

  if (typeof window === 'undefined') {
    // Tell relay to stop its normal garbage collection processes. This prevents
    // data being lost between calling relay's `fetchQuery` and our
    // `finalizeRelay` method below
    environment.getStore().holdGC()

    // For SSG and SSR always create a new Relay environment
    return environment
  }

  // Create the Relay environment once in the client
  if (!relayEnvironment) relayEnvironment = environment

  return relayEnvironment
}

// Used to re-hydrate the relay cache in the client.
// Works with getStaticProps() & getServerSideProps(). For use with
// getInitialProps(), see finalizeRelayInitialProps()
export const finalizeRelay = (environment, pageProps) => {
  pageProps.props = pageProps.props ?? {}
  pageProps.props[RELAY_INITIAL_RECORDS_PROP] = environment
    .getStore()
    .getSource()
    .toJSON()

  return pageProps
}

// Used to re-hydrate the relay cache in the client.
// Works with getInitialProps(). For use with getServerSideProps() or
// getStaticProps(), see finalizeRelay()
export const finalizeRelayInitialProps = (environment, pageProps = {}) => {
  pageProps[RELAY_INITIAL_RECORDS_PROP] = environment
    .getStore()
    .getSource()
    .toJSON()

  return pageProps
}

// For use in react components
export const useRelayEnvironment = (pageProps) => {
  const initialRecords = pageProps[RELAY_INITIAL_RECORDS_PROP]
  return useMemo(() => initializeRelay(initialRecords), [initialRecords])
}
