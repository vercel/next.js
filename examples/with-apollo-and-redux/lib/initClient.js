import { ApolloClient, createNetworkInterface } from 'react-apollo'

let apolloClient = null

function createClient (headers, initialState = {}) {
  return new ApolloClient({
    initialState,
    ssrMode: !process.browser,
    dataIdFromObject: result => result.id || null,
    networkInterface: createNetworkInterface({
      uri: 'https://api.graph.cool/simple/v1/cixmkt2ul01q00122mksg82pn',
      opts: {
        credentials: 'same-origin'
        // Pass headers here if your graphql server requires them
      }
    })
  })
}

export const initClient = (headers, initialState) => {
  if (!process.browser) {
    return createClient(headers, initialState)
  }
  if (!apolloClient) {
    apolloClient = createClient(headers, initialState)
  }
  return apolloClient
}
