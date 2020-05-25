import React, { useEffect, useState } from 'react'
import firebase from 'firebase/app'
import 'firebase/auth'
import initFirebase from './initFirebase'
import { setSession } from './firebaseSessionHandler'
import { createAuthUserInfo } from './user'

initFirebase()

// https://benmcmahen.com/using-firebase-with-react-hooks/

// Defaults to empty AuthUserInfo object.
export const AuthUserInfoContext = React.createContext(createAuthUserInfo())

export const useAuthUserInfo = () => {
  return React.useContext(AuthUserInfoContext)
}

// Returns a Firebase JS SDK user object.
export const useFirebaseAuth = () => {
  const [state, setState] = useState(() => {
    const user = firebase.auth().currentUser
    return {
      initializing: !user,
      user,
    }
  })

  function onChange(user) {
    setState({ initializing: false, user })

    // Call server to update session.
    setSession(user)
  }

  useEffect(() => {
    // Listen for auth state changes.
    const unsubscribe = firebase.auth().onAuthStateChanged(onChange)

    // Unsubscribe to the listener when unmounting.
    return () => unsubscribe()
  }, [])

  return state
}
