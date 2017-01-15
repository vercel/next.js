import ApolloClient, { createNetworkInterface } from 'apollo-client'
import { IS_SERVER } from './exenv'

export const initClient = (headers) => {
  const client = new ApolloClient({
    ssrMode: IS_SERVER,
    headers,
    dataIdFromObject: (result) => {
      if (result.id) {
        return result.id
      }
      return null
    },
    networkInterface: createNetworkInterface({
      uri: 'https://api.graph.cool/simple/v1/cixmkt2ul01q00122mksg82pn',
      opts: {
        credentials: 'same-origin'
      }
    })
  })
  if (IS_SERVER) {
    return client
  } else {
    if (!window.__APOLLO_CLIENT__) {
      window.__APOLLO_CLIENT__ = client
    }
    return window.__APOLLO_CLIENT__
  }
}
