//Realm
import { Credentials, App } from 'realm-web'
//Apollo
import { ApolloClient } from 'apollo-client'
import { InMemoryCache } from 'apollo-cache-inmemory'
import { HttpLink } from 'apollo-link-http'
import { setContext } from 'apollo-link-context'

let apolloClient

export const APP_ID = process.env.REALM_APP_ID

const app = new App({
  id: APP_ID,
  baseUrl: 'https://realm.mongodb.com',
})

// Add an Authorization header with a valid user access token to all GraphQL requests
const authorizationHeaderLink = setContext(async (_, { headers }) => {
  if (app.currentUser) {
    // Refreshing custom data also refreshes the access token
    await app.currentUser.refreshCustomData()
  } else {
    // If no user is logged in, log in an anonymous user
    await app.logIn(Credentials.anonymous())
  }
  // Get a valid access token for the current user
  const { accessToken } = app.currentUser

  // Set the Authorization header, preserving any other headers
  return {
    headers: {
      ...headers,
      Authorization: `Bearer ${accessToken}`,
    },
  }
})

function createApolloClient() {
  // Construct a new Apollo HttpLink that connects to your app's GraphQL endpoint
  const graphql_url = `https://realm.mongodb.com/api/client/v2.0/app/${APP_ID}/graphql`
  const httpLink = new HttpLink({ uri: graphql_url })

  // Construct a new Apollo client with the links we just defined
  const client = new ApolloClient({
    // ssrMode: typeof window === 'undefined',
    link: authorizationHeaderLink.concat(httpLink),
    cache: new InMemoryCache(),
  })

  return client
}

export function initializeApollo(initialState = null) {
  const _apolloClient = apolloClient ?? createApolloClient()

  // If your page has Next.js data fetching methods that use Apollo Client
  if (initialState) {
    _apolloClient.cache.restore(initialState)
  }
  // For SSG and SSR always create a new Apollo Client
  if (typeof window === 'undefined') return _apolloClient
  // Create the Apollo Client once in the client
  if (!apolloClient) apolloClient = _apolloClient

  return _apolloClient
}
