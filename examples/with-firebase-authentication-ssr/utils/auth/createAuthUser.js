import { get, has } from 'lodash/object'

/**
 * Take the user object from Firebase (from either the Firebase admin SDK or
 * or the client-side Firebase JS SDK) and return a consistent AuthUser object.
 * @param {Object} firebaseUser - A decoded Firebase user token or JS SDK
 *   Firebase user object.
 * @return {Object|null} AuthUser - The user object.
 * @return {String|null} AuthUser.id - The user's ID
 * @return {String|null} AuthUser.email - The user's email
 * @return {Boolean} AuthUser.emailVerified - Whether the user has verified their email
 */
const createAuthUser = (firebaseUser) => {
  return {
    id: get(firebaseUser, 'uid', null),
    email: get(firebaseUser, 'email', null),
    emailVerified: has(firebaseUser, 'emailVerified')
      ? get(firebaseUser, 'emailVerified', null) // Firebase JS SDK
      : get(firebaseUser, 'email_verified', false), // Firebase admin SDK
  }
}

export default createAuthUser
