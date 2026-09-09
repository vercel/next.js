import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Ops dashboard</h1>
      <p>
        <Link href="/status">Diagnostics</Link>
      </p>
    </main>
  )
}
