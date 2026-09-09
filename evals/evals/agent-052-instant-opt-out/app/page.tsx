import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Console</h1>
      <Link href="/admin">Admin</Link>
    </main>
  )
}
