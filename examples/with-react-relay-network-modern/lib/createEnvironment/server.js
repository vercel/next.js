import { RelayNetworkLayer, urlMiddleware } from 'react-relay-network-modern/node8'
import RelaySSR from 'react-relay-network-modern-ssr/node8/server'
import { Network, Environment, RecordSource, Store } from 'relay-runtime'

const source = new RecordSource()
const store = new Store(source)
const relaySSR = new RelaySSR()

export default {
  relaySSR,
  environment: new Environment({
    store,
    network: new RelayNetworkLayer([
      urlMiddleware({
        url: req => process.env.RELAY_ENDPOINT
      }),
      relaySSR.getMiddleware()
    ])
  }),
  createEnvironment: relayData =>
    new Environment({
      store,
      network: Network.create(() => relayData[0][1])
    })
}
