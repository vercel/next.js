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
    const cookies = cookie.parse(ctx.req.headers.cookie ?? '')
    const faunaSecret = cookies[FAUNA_SECRET_COOKIE]

    if (!faunaSecret) {
      ctx.res.writeHead(302, { Location: '/login' })
      ctx.res.end()
      return {}
    }

    const profileInfo = await profileApi(faunaSecret)

    return { userId: profileInfo }
  }

  const response = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const data = await response.json()

  if (response.status !== 200) {
    throw new Error(data.message || response.statusText)
  }

  return { userId: data.userId }
}

export default withAuthSync(Profile)
