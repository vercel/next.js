import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <h1>Home</h1>
      <p>Welcome to the home page.</p>
      <nav>
        <Link href="/about">About</Link>
      </nav>
    </main>
  )
}
