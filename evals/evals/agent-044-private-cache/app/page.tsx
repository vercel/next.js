import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Your store</h1>
      <p>Deals refreshed daily.</p>
      <Link id="to-recommendations" href="/recommendations">
        Recommendations
      </Link>
    </main>
  )
}
