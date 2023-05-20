import { Credentials, App } from 'realm-web'

const APP_ID = process.env.NEXT_PUBLIC_REALM_APP_ID
export const REALM_GRAPHQL_ENDPOINT = `https://realm.mongodb.com/api/client/v2.0/app/${APP_ID}/graphql`

const app = new App({
  id: APP_ID,
  baseUrl: 'https://realm.mongodb.com',
})

export const generateAuthHeader = async () => {
  if (!app.currentUser) {
    // If no user is logged in, log in an anonymous user
    await app.logIn(Credentials.anonymous())
  } else {
    // An already logged in user's access token might be stale. To guarantee that the token is
    // valid, we refresh the user's custom data which also refreshes their access token.
    await app.currentUser.refreshCustomData()
  }
  // Get a valid access token for the current user
  const { accessToken } = app.currentUser

  // Set the Authorization header, preserving any other headers
  return {
    Authorization: `Bearer ${accessToken}`,
  }
}
