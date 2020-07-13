import { useEffect, useState } from 'react'
import firebase from 'firebase/app'
import 'firebase/auth'
import initFirebase from 'utils/auth/initFirebase'
import setSession from 'utils/auth/sessionHandler'

initFirebase()

const useFirebaseUser = () => {
  const [user, setUser] = useState()
  const [initialized, setInitialized] = useState(false)

  // When the Firebase SDK user state change, call the server
  // to update the user's session cookie.
  async function onChange(user) {
    try {
      await setSession(user)
    } catch (e) {
      throw e
    }
    setUser(user)
    setInitialized(true)
  }

  useEffect(() => {
    // Listen for auth state changes.
    const unsubscribe = firebase.auth().onAuthStateChanged(onChange)

    // Unsubscribe the listener when unmounting.
    return () => unsubscribe()
  }, [])

  return {
    user,
    initialized,
  }
}

export default useFirebaseUser
