import {
  RelayNetworkLayer,
  cacheMiddleware
} from 'react-relay-network-modern/node8'
import RelaySSR from 'react-relay-network-modern-ssr/node8/client'
import { Environment, RecordSource, Store } from 'relay-runtime'

const source = new RecordSource()
const store = new Store(source)

let storeEnvironment = null

export default {
  createEnvironment: relayData => {
    if (storeEnvironment) return storeEnvironment

    const relaySSR = new RelaySSR(relayData)

    storeEnvironment = new Environment({
      store,
      network: new RelayNetworkLayer([
        cacheMiddleware({
          size: 100,
          ttl: 60 * 1000
        }),
        relaySSR.getMiddleware({
          lookup: false
        })
      ])
    })

    return storeEnvironment
  }
}
