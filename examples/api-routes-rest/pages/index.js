import fetch from 'isomorphic-unfetch'
import Link from 'next/link'

const Index = ({ users }) => (
  <ul>
    {users.map(user => (
      <li key={user.id}>
        <Link href="/user/[id]" as={`/user/${user.id}`}>
          <a>{`User ${user.id}`}</a>
        </Link>
      </li>
    ))}
  </ul>
)

Index.getInitialProps = async () => {
  const response = await fetch('http://localhost:3000/api/users')
  const users = await response.json()

  return { users }
}

export default Index
