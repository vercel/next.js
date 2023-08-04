import 'regenerator-runtime/runtime'
import { Environment, RecordSource, Store } from 'relay-runtime'
import {
  authMiddleware,
  cacheMiddleware,
  RelayNetworkLayer,
  urlMiddleware,
  retryMiddleware,
} from 'react-relay-network-modern'

import skeetCloudConfig from '@root/skeet-cloud.config.json'
import { auth } from './firebase'

const source = new RecordSource()
const store = new Store(source)

let storeEnvironment: Environment | null = null

const getToken = async () => {
  return (await auth?.currentUser?.getIdToken()) ?? ''
}

export const createEnvironment: () => Environment = () => {
  if (storeEnvironment) return storeEnvironment
  storeEnvironment = new Environment({
    store,
    network: new RelayNetworkLayer([
      cacheMiddleware({
        size: 1000,
        ttl: 15 * 60 * 1000,
        allowMutations: true,
        allowFormData: true,
        clearOnMutation: true,
      }),
      typeof window !== 'undefined'
        ? authMiddleware({
            token: getToken,
          })
        : null,
      retryMiddleware(),
      urlMiddleware({
        url: () =>
          process.env.NODE_ENV !== 'production'
            ? 'http://localhost:3000/graphql'
            : `${skeetCloudConfig.cloudRun.url}/graphql`,
      }),
    ]),
  })
  return storeEnvironment
}
