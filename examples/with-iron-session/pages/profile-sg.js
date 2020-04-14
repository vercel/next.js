import React from 'react'
import useUser from '../lib/hooks/useUser'
import Layout from '../components/layout'

const SgProfile = () => {
  const user = useUser({ redirectTo: '/login' })

  return (
    <Layout>
      <h1>Your GitHub profile</h1>
      <h2>
        This page uses{' '}
        <a href="https://nextjs.org/docs/basic-features/pages#static-generation-recommended">
          Static Generation (SG)
        </a>{' '}
        and the <a href="/api/user">/api/user</a> route (using{' '}
        <a href="https://github.com/zeit/swr">zeit/SWR</a>)
      </h2>

      {user?.isLoggedIn && (
        <>
          <p style={{ fontStyle: 'italic' }}>
            Public data, from{' '}
            <a href={githubUrl(user.login)}>{githubUrl(user.login)}</a>, reduced
            to `login` and `avatar_url`.
          </p>
          <pre>{JSON.stringify(user, undefined, 2)}</pre>
        </>
      )}
    </Layout>
  )
}

function githubUrl(login) {
  return `https://api.github.com/${login}`
}

export default SgProfile
