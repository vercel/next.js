import { ReactElement } from 'react'
import firebase from '../firebase/firebaseClient'

export default function Login(): ReactElement {
  async function signInWithGithub() {
    const userCredentials = await firebase
      .auth()
      .signInWithPopup(new firebase.auth.GithubAuthProvider())

    firebase.firestore().collection('users').doc(userCredentials.user.uid).set({
      uid: userCredentials.user.uid,
      email: userCredentials.user.email,
      name: userCredentials.user.displayName,
      provider: userCredentials.user.providerData[0].providerId,
      photoUrl: userCredentials.user.photoURL,
    })
  }

  return (
    <div>
      <button onClick={() => signInWithGithub()}>Sign in with GitHub</button>
    </div>
  )
}
