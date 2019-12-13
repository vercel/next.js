import React from 'react'
import Router from 'next/router'
import nextCookie from 'next-cookies'
import Layout from '../components/layout'
import {query as q} from 'faunadb'
import { withAuthSync, faunaClient } from '../utils/auth'

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
  const { token } = nextCookie(ctx)

  const redirectOnError = () =>
    typeof window !== 'undefined'
      ? Router.push('/login')
      : ctx.res.writeHead(302, { Location: '/login' }).end()

  try {
    const ref = await faunaClient(token).query(q.Identity())
    return {userId: ref.id}
  } catch (error) {
    console.log(error)
    // Implementation or Network error
    return redirectOnError()
  }
}

export default withAuthSync(Profile)
