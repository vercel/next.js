import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Acme Markets</h1>
      <ul>
        <li>
          <Link href="/live">Live ticker</Link>
        </li>
        <li>
          <Link href="/report">Daily report</Link>
        </li>
      </ul>
    </main>
  )
}
