import firebase from 'firebase/app'
import 'firebase/auth'
import initFirebase from 'utils/auth/initFirebase'

initFirebase()

const logout = async () => {
  await firebase.auth().signOut()
}

export default logout
