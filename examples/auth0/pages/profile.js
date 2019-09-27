import React from 'react'

import auth0 from '../lib/auth0'
import { fetchUser } from '../lib/user'
import Layout from '../components/layout'

const Profile = ({ user }) => (
  <Layout user={user}>
    <h1>Profile</h1>

    <div>
      <h3>Profile (server rendered)</h3>
      <pre>{JSON.stringify(user, null, 2)}</pre>
    </div>
  </Layout>
)

Profile.getInitialProps = async ({ req, res }) => {
  if (typeof window === 'undefined') {
    const { user } = await auth0.getSession(req)
    if (!user) {
      res.writeHead(302, {
        Location: '/api/login'
      })
      res.end()
      return
    }

    return { user }
  }
  const cookie = req && req.getHeader('cookie')
  const user = await fetchUser(cookie)
  return { user }
}

export default Profile
