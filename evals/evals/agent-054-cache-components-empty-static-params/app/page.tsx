import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <h1>Events</h1>
      <Link href="/events/launch-day">View the featured event</Link>
    </main>
  )
}
