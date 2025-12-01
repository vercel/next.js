import Link from 'next/link'

export default function HomePage() {
  return (
    <div>
      <h1>Home Page</h1>
      <Link href="/search" id="search-link">
        Go to Search
      </Link>
    </div>
  )
}
