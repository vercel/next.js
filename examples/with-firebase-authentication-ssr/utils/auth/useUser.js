import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import cookies from 'js-cookie'
import firebase from 'firebase/app'
import 'firebase/auth'
import initFirebase from 'utils/auth/initFirebase'
import setSession from 'utils/auth/sessionHandler'

initFirebase()

const useUser = () => {
  const [user, setUser] = useState()
  const router = useRouter()

  const logout = async () => {
    return firebase
      .auth()
      .signOut()
      .then(() => {
        // Sign-out successful.
        cookies.remove('auth')
        router.push('/auth')
      })
      .catch((e) => {
        console.error(e)
      })
  }

  // TODO: remove
  useEffect(() => {
    const cookie = cookies.get('auth')
    if (!cookie) {
      router.push('/')
      return
    }
    setUser(JSON.parse(cookie))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When the Firebase SDK user state change, call the server
  // to update the user's session cookie.
  async function onChange(user) {
    try {
      await setSession(user)
    } catch (e) {
      throw e
    }
    // TODO: use a custom AuthUserInfo object.
    setUser(user)
  }

  useEffect(() => {
    // Listen for auth state changes.
    const unsubscribe = firebase.auth().onAuthStateChanged(onChange)

    // Unsubscribe to the listener when unmounting.
    return () => unsubscribe()
  }, [])

  return { user, logout }
}

export { useUser }
