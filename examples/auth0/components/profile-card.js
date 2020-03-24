function ProfileCard({ user }) {
  if (!user) { return <></> }
  return (
    <>
      <img src={user.picture} alt="user picture" />
      <p>Nickname: <b>{user.nickname}</b></p>
      <p>Name: <b>{user.name}</b></p>
    </>
  )
}

export default ProfileCard
