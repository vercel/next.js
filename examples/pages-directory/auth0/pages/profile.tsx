import { withPageAuthRequired } from '@auth0/nextjs-auth0'
import Layout from '../components/layout'
import { User } from '../interfaces'

type ProfileCardProps = {
  user: User
}

const ProfileCard = ({ user }: ProfileCardProps) => {
  return (
    <>
      <h1>Profile</h1>

      <div>
        <h3>Profile (client rendered)</h3>
        <img src={user.picture} alt="user picture" />
        <p>nickname: {user.nickname}</p>
        <p>name: {user.name}</p>
      </div>
    </>
  )
}

const Profile = ({ user, isLoading }) => {
  return (
    <Layout user={user} loading={isLoading}>
      {isLoading ? <>Loading...</> : <ProfileCard user={user} />}
    </Layout>
  )
}

// Protected route, checking user authentication client-side.(CSR)
export default withPageAuthRequired(Profile)
