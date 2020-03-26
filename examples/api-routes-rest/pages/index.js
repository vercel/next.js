import fetch from 'node-fetch'
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

export async function getStaticProps() {
  const response = await fetch('http://localhost:3000/api/users')
  const users = await response.json()

  return { props: { users } }
}

export default Index
