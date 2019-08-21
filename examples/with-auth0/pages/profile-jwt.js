import React from 'react'
import Link from 'next/link'
import Layout from '../components/layout'
import { getToken } from '../lib/auth'
import redirect from '../lib/redirect'
import { UserProvider, getTokenPayload } from '../lib/user'

const Profile = props => {
  const { name, picture } = props.user || {}

  return (
    <UserProvider user={props.user}>
      <Layout>
        <img src={picture} alt='Avatar' />
        <h1>{name}</h1>
        <p>
          This page uses SSR to decode the payload of <i>id_token</i>
        </p>
        <p>
          because there are no API calls it should render faster than{' '}
          <Link href='/profile'>
            <a>/profile</a>
          </Link>
        </p>

        <style jsx>{`
          img {
            max-width: 200px;
            border-radius: 0.5rem;
          }
          h1 {
            margin-bottom: 0;
          }
          .lead {
            margin-top: 0;
            font-size: 1.5rem;
            font-weight: 300;
            color: #666;
          }
          p {
            color: #6a737d;
          }
        `}</style>
      </Layout>
    </UserProvider>
  )
}

Profile.getInitialProps = async ({ req, res }) => {
  const token = getToken(req)

  if (token) {
    const user = getTokenPayload(token)
    if (user) return { user }
  }

  redirect(res, '/')
  return {}
}

export default Profile
