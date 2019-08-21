import React from 'react'
import Link from 'next/link'
import Layout from '../components/layout'
import fetchApi from '../lib/fetch-api'
import redirect from '../lib/redirect'
import { UserProvider } from '../lib/user'

const Profile = props => {
  const { name, picture } = props.user || {}

  return (
    <UserProvider user={props.user}>
      <Layout>
        <img src={picture} alt='Avatar' />
        <h1>{name}</h1>
        <p>
          This Page does a request to <a href='/api/profile'>/api/profile</a> to
          get info about the user
        </p>
        <p>
          if you to the page{' '}
          <Link href='/profile-jwt'>
            <a>/profile-jwt</a>
          </Link>{' '}
          you should be able to see the same user info, but directly from the
          JWT payload of <i>id_token</i>
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
  try {
    const response = await fetchApi(req, '/api/profile')

    if (response.ok) {
      return { user: await response.json() }
    } else {
      throw new Error(response.statusText)
    }
  } catch (error) {
    console.error(error)
    redirect(res, '/')
    return {}
  }
}

export default Profile
