import { useUser } from '../lib/hooks'
import Layout from '../components/layout'

const Profile = () => {
  const user = useUser({ redirectTo: '/login' })

  return (
    <Layout>
      <h1>Profile</h1>
      {user && <p>Your session:<pre>{JSON.stringify(user, null, 2)}</pre></p>}
    </Layout>
  )
}

export default Profile
