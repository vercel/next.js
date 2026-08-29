import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Field Service Desk</h1>
      <Link href="/tickets">Go to tickets</Link>
    </main>
  )
}
