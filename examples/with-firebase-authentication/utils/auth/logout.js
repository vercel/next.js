import firebase from 'firebase/app'
import 'firebase/auth'
import cookie from 'js-cookie'
import initFirebase from '../auth/initFirebase'

initFirebase()

export default async function logout() {
  return firebase
    .auth()
    .signOut()
    .then(() => {
      // Sign-out successful.
      cookie.remove('auth')
      return true
    })
    .catch((e) => {
      console.error(e)
      return false
    })
}
