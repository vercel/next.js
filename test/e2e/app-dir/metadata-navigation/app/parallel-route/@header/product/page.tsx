import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1 id="product-title">Product header</h1>
      <Link href="/parallel-route" id="home-link">
        Go to Home page
      </Link>
    </div>
  )
}
