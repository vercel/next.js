import fetch from 'node-fetch'

const User = ({ user }) => <div>{user.name}</div>

export async function getStaticPaths() {
  const response = await fetch(`http://localhost:3000/api/users`)
  const users = await response.json()

  const paths = users.map(user => `/user/${user.id}`)
  return { paths, fallback: false }
}

export async function getStaticProps({ params }) {
  const response = await fetch(`http://localhost:3000/api/user/${params.id}`)
  const user = await response.json()
  return { props: { user } }
}

export default User
