import Link from 'next/link'

export default function Page() {
  return (
    <ul>
      <li>
        <Link href="/with-middleware/search-params?id=1">
          /search-params?id=1
        </Link>
      </li>
      <li>
        <Link href="/with-middleware/search-params?id=2">
          /search-params?id=2
        </Link>
      </li>
      <li>
        <Link
          href="/with-middleware/search-params?id=3"
          prefetch="unstable_forceStale"
        >
          /search-params?id=3 (prefetch: true)
        </Link>
      </li>
      <li>
        <Link
          href="/with-middleware/search-params"
          prefetch="unstable_forceStale"
        >
          /search-params (prefetch: true)
        </Link>
      </li>
    </ul>
  )
}
