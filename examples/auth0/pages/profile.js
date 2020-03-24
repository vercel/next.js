import Layout from '../components/layout'
import ProfileCard from '../components/profile-card'
import { useFetchUser } from '../lib/user'

function Profile() {
  const { user, loading } = useFetchUser({ required: true })

  return (
      <Layout user={user} loading={loading}>        
        <h1>Profile (client rendered)</h1>
        <ProfileCard user={user}/>
      </Layout>
  )
}

export default Profile
