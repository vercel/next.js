import {
  RelayNetworkLayer,
  cacheMiddleware,
  urlMiddleware,
} from 'react-relay-network-modern/node8'
import { Environment, RecordSource, Store } from 'relay-runtime'

let store, source

let storeEnvironment = null

export default {
  createEnvironment: (records) => {
    if (!store) {
      source = new RecordSource(records)
      store = new Store(source)
    }
    if (storeEnvironment) return storeEnvironment

    storeEnvironment = new Environment({
      store,
      network: new RelayNetworkLayer([
        cacheMiddleware({
          size: 100,
          ttl: 60 * 1000,
        }),
        urlMiddleware({
          url: (req) => process.env.RELAY_ENDPOINT,
        }),
      ]),
    })

    return storeEnvironment
  },
}
