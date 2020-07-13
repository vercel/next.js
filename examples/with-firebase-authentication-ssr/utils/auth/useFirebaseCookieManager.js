// When the Firebase auth state changes, call our endpoint to
// set or unset the auth cookie.
// Add this hook once to a top-level component.
import { useEffect } from 'react'
import firebase from 'firebase/app'
import 'firebase/auth'
import initFirebase from 'utils/auth/initFirebase'

initFirebase()

const setSession = async (firebaseUser) => {
  // If the user is authed, call login to set a cookie.
  if (firebaseUser) {
    const userToken = await firebaseUser.getIdToken()
    return fetch('/api/login', {
      method: 'POST',
      headers: {
        Authorization: userToken,
      },
      credentials: 'include',
    })
  }

  // If the user is not authed, call logout to unset the cookie.
  return fetch('/api/logout', {
    method: 'POST',
    credentials: 'include',
  })
}

const useFirebaseUser = () => {
  // When the Firebase SDK user state change, call the server
  // to update the user's session cookie.
  async function onChange(user) {
    try {
      await setSession(user)
    } catch (e) {
      throw e
    }
  }

  useEffect(() => {
    // Listen for auth state changes.
    const unsubscribe = firebase.auth().onAuthStateChanged(onChange)

    // Unsubscribe the listener when unmounting.
    return () => unsubscribe()
  }, [])

  return null
}

export default useFirebaseUser
