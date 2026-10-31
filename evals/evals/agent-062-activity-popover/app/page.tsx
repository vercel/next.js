import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Account</h1>
      <Link href="/settings">Open settings</Link>
    </main>
  )
}
