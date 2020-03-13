import { useState, useEffect, createContext, useContext } from 'react'
import firebase from 'firebase/app'
import 'firebase/auth' // If you need it
import 'firebase/firestore' // If you need it
import 'firebase/storage' // If you need it
import 'firebase/analytics' // If you need it
import clientCredentials from '../credentials/client' // Your credentials

export const FirebaseContext = createContext()

export default ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false)
  const [user, setUser] = useState(null)
  const [loadingUser, setLoadingUser] = useState(true) // Helpful, to update the UI accordingly.

  useEffect(() => {
    // Initialize Firebase
    if (!firebase.apps.length) {
      try {
        firebase.initializeApp(clientCredentials)
        // Analytics
        if ('measurementId' in clientCredentials) firebase.analytics()
        // Listen authenticated user
        firebase.auth().onAuthStateChanged(async user => {
          try {
            if (user) {
              // User is signed in.
              const { uid, displayName, email, photoURL } = user
              // You could also look for the user doc in your Firestore (if you have one):
              // const userDoc = await firebase.firestore().doc(`users/${uid}`).get()
              setUser({ uid, displayName, email, photoURL })
            } else setUser(null)
          } catch (error) {
            // Most probably a connection error. Handle appropiately.
          } finally {
            setLoadingUser(false)
          }
        })
        setIsInitialized(true)
      } catch (error) {
        // This error will be: Invalid API Key of something of that sort. Because you need to fill in your credentials!
        console.error(error)
      }
    }
  }, [])

  return (
    <FirebaseContext.Provider
      value={{ isInitialized, user, setUser, loadingUser }}
    >
      {children}
    </FirebaseContext.Provider>
  )
}

// Custom hook that shorhands the context!
export const useFirebase = () => useContext(FirebaseContext)
