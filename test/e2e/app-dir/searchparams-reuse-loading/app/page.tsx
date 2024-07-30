import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/search">Go to search</Link>
      <hr />

      <ul>
        <li>
          <Link href="/search-params?id=1">/search-params?id=1</Link>
        </li>
        <li>
          <Link href="/search-params?id=2">/search-params?id=2</Link>
        </li>
        <li>
          <Link href="/search-params?id=3" prefetch>
            /search-params?id=3 (prefetch: true)
          </Link>
        </li>
      </ul>
    </>
  )
}
