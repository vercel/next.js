import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <h1>Signal Shop</h1>
      <Link href="/products/lamp?currency=EUR">Brass lamp</Link>
    </main>
  )
}
