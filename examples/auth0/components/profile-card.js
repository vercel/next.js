import { useContext } from 'react'
import { AuthContext } from '../lib/authProvider'

function ProfileCard({ SSRUser }) {
  let { user, loading } = useContext(AuthContext)
  if (SSRUser) {
    user = SSRUser
  }
  if (loading) {
    return <p>loading</p>
  }
  if (!user) {
    return <></>
  }
  return (
    <>
      <img src={user.picture} alt="user picture" />
      <p>nickname: {user.nickname}</p>
      <p>name: {user.name}</p>
    </>
  )
}

export default ProfileCard
