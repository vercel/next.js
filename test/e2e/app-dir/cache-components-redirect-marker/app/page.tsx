import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      <p>
        <Link href="/a">Go to A (gated)</Link>
      </p>
      <p>
        <Link href="/b">Go to B (plain)</Link>
      </p>
    </main>
  )
}
