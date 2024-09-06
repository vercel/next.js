import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1 id="product-title">Product header</h1>
      <Link href="/" id="home-link">
        Go to Home page
      </Link>
    </div>
  )
}
