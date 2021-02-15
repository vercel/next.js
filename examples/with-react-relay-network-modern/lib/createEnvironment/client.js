import {
  RelayNetworkLayer,
  cacheMiddleware,
  urlMiddleware,
} from 'react-relay-network-modern/node8'
import RelaySSR from 'react-relay-network-modern-ssr/node8/client'
import { Environment, RecordSource, Store } from 'relay-runtime'

const source = new RecordSource()
const store = new Store(source)

let storeEnvironment = null

export default {
  createEnvironment: (relayData) => {
    if (storeEnvironment) return storeEnvironment

    storeEnvironment = new Environment({
      store,
      network: new RelayNetworkLayer([
        cacheMiddleware({
          size: 100,
          ttl: 60 * 1000,
        }),
        new RelaySSR(relayData).getMiddleware({
          lookup: false,
        }),
        urlMiddleware({
          url: (req) => process.env.NEXT_PUBLIC_RELAY_ENDPOINT,
        }),
      ]),
    })

    return storeEnvironment
  },
}
