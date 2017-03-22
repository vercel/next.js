import React, { PropTypes } from 'react'
import { auth } from 'firebase'
import Link from 'next/link'

const provider = new auth.GoogleAuthProvider()

function login() {
  auth().signInWithPopup(provider)
}

function logout() {
  auth().signOut()
}

export default ({ user }) => (
  <header>
    <Link href="/"><a>Home</a></Link>
    {
      user
      ? <button onClick={logout}>Sign out</button>
      : <button onClick={login}>Log In/Sign up</button>
    }
  </header>
)
