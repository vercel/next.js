import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Acme</h1>
      <p>
        <Link href="/pricing">See pricing</Link>
      </p>
    </main>
  )
}
