import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <h1 id="home-page">Home</h1>
      {/* Tall filler so the links are far below the fold. */}
      <div style={{ height: 5000 }} />
      {/* The proxy redirects /about (no locale prefix) to /en/about. */}
      <Link href="/about" id="link-redirected">
        Go to /about (redirected to /en/about)
      </Link>
      {/* Control: same destination, no redirect. */}
      <Link href="/en/about" id="link-direct">
        Go to /en/about
      </Link>
    </main>
  )
}
