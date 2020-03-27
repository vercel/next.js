import useSwr from 'swr'
import Link from 'next/link'

const fetcher = async url => {
  const res = await fetch(url)
  return res.json()
}

const Index = () => {
  const { data, error } = useSwr('/api/users', fetcher)
  if (error) return <div>Failed to load users</div>
  if (!data) return <div>Loading...</div>

  return (
    <ul>
      {data.map(user => (
        <li key={user.id}>
          <Link href="/user/[id]" as={`/user/${user.id}`}>
            <a>{`User ${user.id}`}</a>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default Index
