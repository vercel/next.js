import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <h1>Storefront</h1>
      <p>
        <Link href="/products">Browse the catalog</Link>
      </p>
    </main>
  )
}
