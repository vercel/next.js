import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Acme Support Console</h1>
      <p>
        Jump into the <Link href="/orders">orders dashboard</Link> to triage
        incoming orders.
      </p>
    </main>
  )
}
