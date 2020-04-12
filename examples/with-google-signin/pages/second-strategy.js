import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import { useSignInStatus } from '../lib/hooks'
import { fetchWithToken, signOut } from '../lib/utils'

const Index = () => {
  const [posts, setPosts] = useState()
  const { user, accessToken } = useSignInStatus()

  useEffect(() => {
    const fetchData = async () => {
      const data = await fetchWithToken('/api/user', accessToken)
      setPosts(data)
    }
    accessToken.length > 0 && fetchData()
  }, [accessToken])

  return (
    <div>
      <Head>
        <title>Second Strategy | Google Sign-In</title>
      </Head>
      <div style={{ padding: '50px' }}>
        {user ? (
          <div>
            <div>
              <p>{user.name}</p>
              <p>{user.email}</p>
              <img src={user.imageUrl} width="100" height="100" />
              {posts && (
                <ul>
                  {posts.map(post => (
                    <li key={post.id}>{post.title}</li>
                  ))}
                </ul>
              )}
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
