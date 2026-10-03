import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <h1>Home</h1>
      <Link href="/users/user1/test" id="to-user">
        Go to user1
      </Link>
    </div>
  )
}
