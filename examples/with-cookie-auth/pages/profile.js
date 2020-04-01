import React, { useEffect } from 'react'
import Router from 'next/router'
import fetch from 'isomorphic-unfetch'
import nextCookie from 'next-cookies'
import Layout from '../components/layout'
import getHost from '../utils/get-host'

const Profile = props => {
  const { name, login, bio, avatarUrl } = props.json.data

  const syncLogout = event => {
    if (event.key === 'logout') {
      console.log('logged out from storage!')
      Router.push('/login')
    }
  }

  useEffect(() => {
    window.addEventListener('storage', syncLogout)

    return () => {
      window.removeEventListener('storage', syncLogout)
      window.localStorage.removeItem('logout')
    }
  }, [])

  return (
    <Layout>
      <img src={avatarUrl} alt="Avatar" />
      <h1>{name}</h1>
      <p className="lead">{login}</p>
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
  )
}

export async function getServerSideProps(ctx) {
  const { token } = nextCookie(ctx)
  const apiUrl = getHost(ctx.req) + '/api/profile'

  const redirectOnError = () =>
    typeof window !== 'undefined'
      ? Router.push('/login')
      : ctx.res.writeHead(302, { Location: '/login' }).end()

  try {
    const response = await fetch(apiUrl, {
      credentials: 'include',
      headers: {
        Authorization: JSON.stringify({ token }),
      },
    })

    if (response.ok) {
      const json = await response.json()
      return {
        props: {
          json,
        },
      }
    } else {
      // https://github.com/developit/unfetch#caveats
      return await redirectOnError()
    }
  } catch (error) {
    // Implementation or Network error
    return redirectOnError()
  }
}

export default Profile
