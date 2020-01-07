import React from 'react'
import Layout from '../components/layout'
import { withAuthSync } from '../utils/auth'
import cookie from 'cookie'
import { FAUNA_SECRET_COOKIE } from '../utils/fauna-auth'
import { profileApi } from './api/profile'

const Profile = props => {
  const { userId } = props

  return (
    <Layout>
      <h1>Your user id is {userId}</h1>

      <style jsx>{`

        h1 {
          margin-bottom: 0;
        }
      `}</style>
    </Layout>
  )
}

Profile.getInitialProps = async ctx => {
  if (ctx.req) {
    console.log(ctx.req.headers.cookie)
    var cookies = cookie.parse(ctx.req.headers.cookie ?? '')
    var faunaSecret = cookies[FAUNA_SECRET_COOKIE]
    if (!faunaSecret) {
      // If `ctx.req` is available it means we are on the server.
      ctx.res.writeHead(302, { Location: '/login' });
      ctx.res.end();
    }
    var profileInfo = await profileApi(faunaSecret);
    return {userId: profileInfo};
  } else {
    const response = await fetch('/api/profile', {
      method: 'POST',

      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (response.status === 200) {
      const { userId } = await response.json()
      return { userId }
    } else {
      console.log('Profile lookup failed.')
      // https://github.com/developit/unfetch#caveats
      const { message } = await response.json()
      let error = new Error(message ? message : response.statusText)
      throw error
    }
  }
}

export default withAuthSync(Profile)
