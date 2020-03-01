import fetch from 'isomorphic-unfetch'

const User = ({ user }) => <div>{user.name}</div>

User.getInitialProps = async ({ query: { id } }, res) => {
  const response = await fetch(`http://localhost:3000/api/user/${id}`)
  const user = await response.json()

  return { user }
}

export default User
