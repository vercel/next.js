import ApolloClient, { createNetworkInterface } from 'apollo-client'

export const initClient = (headers) => {
  const client = new ApolloClient({
    ssrMode: !process.browser,
    headers,
    dataIdFromObject: result => result.id || null,
    networkInterface: createNetworkInterface({
      uri: 'https://api.graph.cool/simple/v1/cixmkt2ul01q00122mksg82pn',
      opts: {
        credentials: 'same-origin'
      }
    })
  })
  if (!process.browser) {
    return client
  }
  if (!window.APOLLO_CLIENT) {
    window.APOLLO_CLIENT = client
  }
  return window.APOLLO_CLIENT
}
