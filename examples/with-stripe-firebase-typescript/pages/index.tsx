import React from 'react'
import Login from '../components/Login'
import styles from '../styles/Home.module.css'
import firebase from '../firebase/firebaseClient'
import { useAuthState } from 'react-firebase-hooks/auth'
import { createCheckoutSession } from '../stripe/createCheckoutSession'
import usePremiumStatus from '../stripe/usePremiumStatus'

export default function Home() {
  const [user, userLoading] = useAuthState(firebase.auth())
  const userIsPremium = usePremiumStatus(user)

  return (
    <div className={styles.container}>
      {!user && userLoading && <h1>Loading...</h1>}
      {!user && !userLoading && <Login />}
      {user && !userLoading && (
        <div>
          <h1>Hello, {user.displayName}</h1>
          {!userIsPremium ? (
            <button onClick={() => createCheckoutSession(user.uid)}>
              Upgrade to premium!
            </button>
          ) : (
            <h2>Have a cookie 🍪 Premium customer!</h2>
          )}
        </div>
      )}
    </div>
  )
}
