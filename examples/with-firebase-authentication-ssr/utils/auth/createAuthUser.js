import { get } from 'lodash/object'

/**
 * Take the user object (either an AuthUserSerializable object or a user
 * from client-side Firebase JS SDK) and return an AuthUser object.
 * @param {Object} user - Either: a Firebase JS SDK user object or an
 *   AuthUserSerializable object.
 * @param {Boolean} clientInitialized - This should be true if the
 *   Firebase JS SDK has initialized, meaning we know the AuthUser value
 *   is from the source of truth. Defaults to false.
 * @return {Object|null} AuthUser - The user object.
 * @return {String|null} AuthUser.id - The user's ID
 * @return {String|null} AuthUser.email - The user's email
 * @return {Boolean} AuthUser.emailVerified - Whether the user has verified their email
 * @return {Function} AuthUser.getIdToken - An asynchronous function that
 *   resolves to the Firebase user's ID token string, or null if the user is
 *   not authenticated.
 * @return {Boolean} AuthUser.clientInitialized - Whether the client-side
 *   Firebase JS SDK has initialized.
 */
const createAuthUser = (user, clientInitialized = false) => {
  return {
    id: get(user, 'uid', null),
    email: get(user, 'email', null),
    emailVerified: get(user, 'emailVerified', false),
    // We want this method to be isomorphic.
    // When `user` is an AuthUserSerializable object, take the token value
    // and return it from this method.
    // After the Firebase JS SDK has initialized on the client side, use the
    // Firebase SDK's getIdToKen method, which will handle refreshing the token
    // as needed.
    getIdToken:
      user && user.getIdToken
        ? async () => user.getIdToken()
        : async () => (user && user.token ? user.token : null),
    // clientInitialized is true if the user state is determined by
    // the Firebase JS SDK.
    clientInitialized,
  }
}

/**
 * Take the user object from the Firebase admin SDK and return a
 * serializable object, AuthUserSerializable. This can be returned from
 * `getServerSideProps`. It can be passed to `createAuthUser` during render
 * to create an AuthUser object.
 * @param {Object} firebaseUser - A decoded user from the Firebase admin SDK
 * @return {Object|null} AuthUserSerializable - The user object.
 * @return {String|null} AuthUserSerializable.uid - The user's ID
 * @return {String|null} AuthUserSerializable.email - The user's email
 * @return {Boolean} AuthUserSerializable.emailVerified - Whether the user has
 *   verified their email
 * @return {String} AuthUserSerializable.token - The user's ID token
 */
export const createAuthUserSerializable = (firebaseUser, idToken = null) => {
  return {
    uid: get(firebaseUser, 'uid', null),
    email: get(firebaseUser, 'email', null),
    emailVerified: get(firebaseUser, 'email_verified', false),
    // Provide this so the token can be available during SSR and
    // client-side renders prior to the Firebase JS SDK initializing.
    token: idToken,
  }
}

export default createAuthUser
