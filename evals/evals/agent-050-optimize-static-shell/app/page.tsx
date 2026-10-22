import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <h1>Launch control</h1>
      <p>Monitor active releases and production rollouts.</p>
      <Link href="/releases/aurora">Open Aurora release</Link>
    </main>
  )
}
