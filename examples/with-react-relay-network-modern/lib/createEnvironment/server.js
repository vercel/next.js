import {
  RelayNetworkLayer,
  urlMiddleware
} from 'react-relay-network-modern/node8'
import RelaySSR from 'react-relay-network-modern-ssr/node8/server'
import { Network, Environment, RecordSource, Store } from 'relay-runtime'

export default {
  initEnvironment: () => {
    const source = new RecordSource()
    const store = new Store(source)
    const relaySSR = new RelaySSR()

    return {
      relaySSR,
      environment: new Environment({
        store,
        network: new RelayNetworkLayer([
          urlMiddleware({
            url: req => process.env.RELAY_ENDPOINT
          }),
          relaySSR.getMiddleware()
        ])
      })
    }
  },
  createEnvironment: (relayData, key) => {
    const source = new RecordSource()
    const store = new Store(source)

    return new Environment({
      store,
      network: Network.create(
        () => relayData.find(([dataKey]) => dataKey === key)[1]
      )
    })
  }
}
