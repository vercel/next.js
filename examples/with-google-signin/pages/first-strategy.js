import React from 'react'
import Head from 'next/head'
import { useSignInStatus } from '../lib/hooks'
import { signOut } from '../lib/utils'

const Index = () => {
  const { user } = useSignInStatus()

  return (
    <div>
      <Head>
        <title>First Strategy | Google Sign-In</title>
      </Head>
      <div style={{ padding: '50px' }}>
        {user ? (
          <div>
            <div>
              <p>{user.name}</p>
              <p>{user.email}</p>
              <img src={user.imageUrl} width="100" height="100" />
            </div>
            <button onClick={signOut}>Sign Out</button>
          </div>
        ) : (
          <div>loading...</div>
        )}
      </div>
    </div>
  )
}

export default Index
