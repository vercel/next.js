import cookie from 'cookie'
import { withAuthSync } from '../utils/auth'
import { FAUNA_SECRET_COOKIE } from '../utils/fauna-auth'
import { profileApi } from './api/profile'
import Layout from '../components/layout'

const Profile = (props) => {
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

export const getServerSideProps = async (context) => {
  const { req, res } = context
  const cookies = cookie.parse(req.headers.cookie ?? '')
  const faunaSecret = cookies[FAUNA_SECRET_COOKIE]

  if (!faunaSecret) {
    res.writeHead(302, { Location: '/login' })
    res.end()
    return
  }

  const userId = await profileApi(faunaSecret)

  return {
    props: {
      userId,
    },
  }
}

export default withAuthSync(Profile)
