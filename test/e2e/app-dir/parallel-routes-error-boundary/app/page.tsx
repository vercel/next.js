import Link from 'next/link'

export default function HomePage() {
  return (
    <div>
      <h1 id="home-title">Home Page</h1>
      <Link href="/page/one" id="link-to-dynamic">
        Go to Page One
      </Link>
    </div>
  )
}
