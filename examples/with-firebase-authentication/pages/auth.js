import React from 'react'
import FirebaseAuth from '../components/FirebaseAuth'

const Auth = () => {
  return (
    <div>
      <p>Sign in</p>
      <div>
        <FirebaseAuth />
      </div>
    </div>
  )
}

Auth.propTypes = {}

export default Auth
