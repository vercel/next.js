import { ApolloClient } from 'apollo-client'
import { InMemoryCache } from 'apollo-cache-inmemory'
import { HttpLink } from 'apollo-link-http'
import { WebSocketLink } from 'apollo-link-ws'
import { SubscriptionClient } from 'subscriptions-transport-ws'
import { getMainDefinition } from 'apollo-utilities'
import { split } from 'apollo-link'

const URI = 'https://api.graph.cool/simple/v1/cixmkt2ul01q00122mksg82pn'
const WS_URI = 'wss://subscriptions.graph.cool/v1/cixmkt2ul01q00122mksg82pn'

export default function createApolloClient(initialState, ctx) {
  // console.log('in apolloCLient', ctx);
  let link, token, httpLink, wsLink

  // incase you've set your cookie use the cookie package from
  // js-cookie go extract your token and save it in the token variable
  // which you can pass as your auth header.
  const ssrMode = typeof window === 'undefined'
  // token = cookie.get('token');

  httpLink = new HttpLink({
    uri: URI,
    credentials: 'same-origin'
    // headers: {
    //   Authorization: token ? `Bearer ${token}` : ''
    // }
  })

  // web socket only works in the client and considering that
  //  nextjs is server rendered, we need a way to ensure that
  // the web socket connection only works on the client/

  if (ssrMode) {
    // if we are not on the client, return a new instance of apollo
    //  client and pass the http link created above as the link to connect to.
    return new ApolloClient({
      ssrMode,
      link: httpLink,
      cache: new InMemoryCache().restore(initialState)
    })
  } else {
    // on Client...

    // create a new websocket client with your configurations.
    const client = new SubscriptionClient(WS_URI, {
      reconnect: true,
      connectionParams: {
        // headers: {
        // Authorization: token ? `Bearer ${token}` : ''
        // }
      }
    })

    // create a new web socket link with your configured client
    wsLink = new WebSocketLink(client)

    // this ensures that only subscriptions are made through websockets.
    // without this, all request in the client would be made through websockets.
    link = process.browser
      ? split(
          //only create the split in the browser
          // split based on operation type
          ({ query }) => {
            const { kind, operation } = getMainDefinition(query)
            return (
              kind === 'OperationDefinition' && operation === 'subscription'
            )
          },
          wsLink,
          httpLink
        )
      : httpLink

    // return a new apollo client with your client configuration that
    //  conditionally uses websocket or http depending on the mode of graphql operation.
    return new ApolloClient({
      ssrMode,
      link,
      cache: new InMemoryCache().restore(initialState)
    })
  }
}
