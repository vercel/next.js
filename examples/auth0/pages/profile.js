import Layout from '../components/layout'
import ProfileCard from '../components/profile-card'
import AuthProvider from '../lib/authProvider'

function Profile() {
  return (
    <AuthProvider>
      <Layout>
        <h1>Profile (client rendered)</h1>
        <ProfileCard />
      </Layout>
    </AuthProvider>
  )
}

export default Profile
