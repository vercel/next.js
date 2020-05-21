import {
  RelayNetworkLayer,
  urlMiddleware,
} from 'react-relay-network-modern/node8'
import { Environment, RecordSource, Store } from 'relay-runtime'

export default {
  initEnvironment: () => {
    const source = new RecordSource()
    const store = new Store(source)

    return {
      environment: new Environment({
        store,
        network: new RelayNetworkLayer([
          urlMiddleware({
            url: (req) => process.env.RELAY_ENDPOINT,
          }),
        ]),
      }),
    }
  },
  createEnvironment: (records) => {
    const source = new RecordSource(records)
    const store = new Store(source)

    return new Environment({
      store,
      network: new RelayNetworkLayer([
        urlMiddleware({
          url: (req) => process.env.RELAY_ENDPOINT,
        }),
      ]),
    })
  },
}
