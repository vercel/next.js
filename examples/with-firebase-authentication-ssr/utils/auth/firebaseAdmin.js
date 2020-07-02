import * as admin from 'firebase-admin'

// Initialize the Firebase app.
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // https://stackoverflow.com/a/41044630/1332513
      privateKey: firebasePrivateKey.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  })
}

// https://firebase.google.com/docs/auth/admin/errors
const FIREBASE_ERROR_TOKEN_EXPIRED = 'auth/id-token-expired'

/**
 * Given a refresh token, get a new Firebase ID token. Call this when
 * the Firebase ID token has expired.
 * @return {String} The new ID token
 */
const refreshExpiredIdToken = async (refreshToken) => {
  // https://firebase.google.com/docs/reference/rest/auth/#section-refresh-token
  const endpoint = `https://securetoken.googleapis.com/v1/token?key=${process.env.NEXT_PUBLIC_FIREBASE_PUBLIC_API_KEY}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  const responseJSON = await response.json()
  if (!response.ok) {
    throw new Error(`Problem refreshing token: ${responseJSON}`)
  }
  const idToken = responseJSON.id_token
  return idToken
}

/**
 * Verify the Firebase ID token and return the Firebase user.
 * If the ID token has expired, refresh it if a refreshToken
 * is provided.
 * @return {Object} The Firebase user
 */
export const verifyIdToken = async (token, refreshToken = null) => {
  let firebaseUser
  try {
    firebaseUser = await admin.auth().verifyIdToken(token)
  } catch (e) {
    // If the user's ID token has expired, refresh it if possible.
    if (refreshToken && e.code === FIREBASE_ERROR_TOKEN_EXPIRED) {
      const newToken = await refreshExpiredIdToken(refreshToken)
      firebaseUser = await admin.auth().verifyIdToken(newToken)
    }
    // Otherwise, throw.
    throw e
  }
  return firebaseUser
}

/**
 * Given a Firebase ID token, create a custom token. This
 * provides us access to a refresh token that we can use to
 * refresh expired ID tokens during server-side rendering.
 * See:
 * https://firebase.google.com/docs/reference/rest/auth/#section-refresh-token
 * https://stackoverflow.com/a/38284384
 * @return {Object} tokenInfo
 * @return {String} tokenInfo.idToken - The user's ID token
 * @return {String} tokenInfo.refreshToken - The user's refresh token
 */
export const getCustomIdAndRefreshTokens = async (token) => {
  const firebaseUser = await verifyIdToken(token)

  // It's important that we pass the same user ID here, otherwise
  // Firebase will create a new user.
  const customToken = await admin.auth().createCustomToken(firebaseUser.uid)

  // https://firebase.google.com/docs/reference/rest/auth/#section-verify-custom-token
  const refreshTokenEndpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_PUBLIC_API_KEY}`
  const refreshTokenResponse = await fetch(refreshTokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token: customToken,
      returnSecureToken: true,
    }),
  })
  const refreshTokenJSON = await refreshTokenResponse.json()
  if (!refreshTokenResponse.ok) {
    throw new Error(`Problem getting a refresh token: ${refreshTokenJSON}`)
  }
  const { idToken, refreshToken } = refreshTokenJSON

  return {
    idToken,
    refreshToken,
  }
}
