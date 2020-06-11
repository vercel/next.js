import { useEffect, useState } from 'react'
import Router from 'next/router'
import cookies from 'js-cookie'
import firebase from 'firebase/app'
import 'firebase/auth'
import initFirebase from '../auth/initFirebase'

initFirebase()

const useUser = () => {
  const [user, setUser] = useState()

  const logout = async () => {
    return firebase
      .auth()
      .signOut()
      .then(() => {
        // Sign-out successful.
        cookies.remove('auth')
        Router.push('/auth')
      })
      .catch((e) => {
        console.error(e)
      })
  }

  useEffect(() => {
    const cookie = cookies.get('auth')
    if (!cookie) {
      Router.push('/')
      return
    }
    setUser(JSON.parse(cookie))
  }, [])

  return { user, logout }
}

export { useUser }
