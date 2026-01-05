import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Chunk Load Retry Test</h1>
      <nav>
        <Link href="/dynamic">Go to dynamic page</Link>
      </nav>
    </main>
  )
}
