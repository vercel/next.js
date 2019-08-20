import React from 'react'
import fetch from 'isomorphic-unfetch'
import Layout from '../components/layout'
import { ROOT_URL } from '../lib/configs'
import { getToken } from '../lib/auth'
import redirect from '../lib/redirect'
import { UserProvider } from '../lib/user'

const Profile = props => {
  const { name, login, bio, avatarUrl } = props.user || {}

  return (
    <UserProvider user={props.user}>
      <Layout>
        <img src={avatarUrl} alt='Avatar' />
        <h1>{name}</h1>
        <p className='lead'>{login}</p>
        <p>{bio}</p>

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
  const loginToken = getToken(req)
  const url = ROOT_URL + '/api/profile'

  if (loginToken) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${loginToken}`
        }
      })

      if (response.ok) {
        return { user: await response.json() }
      } else {
        throw new Error(response.statusText)
      }
    } catch (error) {
      console.error(error)
    }
  }

  redirect(res, '/')
  return {}
}

export default Profile
