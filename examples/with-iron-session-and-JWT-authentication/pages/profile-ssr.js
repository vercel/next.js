import Layout from '../components/Layout'
import withSession from '../lib/session'
import PropTypes from 'prop-types'

const SsrProfile = ({ user }) => {
  return (
    <Layout>
      <h1>Your profile</h1>
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

SsrProfile.propTypes = {
  user: PropTypes.shape({
    isLoggedIn: PropTypes.bool,
    login: PropTypes.object,
    avatarUrl: PropTypes.string,
  }),
}
