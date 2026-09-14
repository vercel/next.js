import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Welcome</h1>
      <p>This is the home page.</p>
      <Link href="/admin">Go to Admin Dashboard</Link>
    </main>
  )
}
