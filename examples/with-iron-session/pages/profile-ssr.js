import Layout from '../components/Layout'
import withSession from '../lib/session'
import PropTypes from 'prop-types'

const SsrProfile = ({ user }) => {
  return (
    <Layout>
      <h1>Your GitHub profile</h1>
      <h2>
        This page uses{' '}
        <a href="https://nextjs.org/docs/basic-features/pages#server-side-rendering">
          Server-side Rendering (SSR)
        </a>{' '}
        and{' '}
        <a href="https://nextjs.org/docs/basic-features/data-fetching#getserversideprops-server-side-rendering">
          getServerSideProps
        </a>
      </h2>

      {user?.isLoggedIn && (
        <>
          <p style={{ fontStyle: 'italic' }}>
            Public data, from{' '}
            <a href={githubUrl(user.login)}>{githubUrl(user.login)}</a>, reduced
            to `login` and `avatar_url`.
          </p>
          <pre>{JSON.stringify(user, null, 2)}</pre>
        </>
      )}
    </Layout>
  )
}

export const getServerSideProps = withSession(async function ({ req, res }) {
  const user = req.session.get('user')

  if (!user) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }

  return {
    props: { user: req.session.get('user') },
  }
})

export default SsrProfile

function githubUrl(login) {
  return `https://api.github.com/users/${login}`
}

SsrProfile.propTypes = {
  user: PropTypes.shape({
    isLoggedIn: PropTypes.bool,
    login: PropTypes.string,
    avatarUrl: PropTypes.string,
  }),
}
