import Link from 'next/link'

export default function Page() {
  // Link order is significant: viewport prefetches are prioritized by document
  // order (links nearest the top are prefetched first). The full-prefetch links
  // are listed first so they win priority and complete their full prefetch
  // before the auto-prefetch links resolve the middleware redirect.
  return (
    <ul>
      <li>
        <Link href="/with-middleware/search-params" prefetch={true}>
          /search-params (prefetch: true)
        </Link>
      </li>
      <li>
        <Link href="/with-middleware/search-params?id=3" prefetch={true}>
          /search-params?id=3 (prefetch: true)
        </Link>
      </li>
      <li>
        <Link href="/with-middleware/search-params?id=2">
          /search-params?id=2
        </Link>
      </li>
      <li>
        <Link href="/with-middleware/search-params?id=1">
          /search-params?id=1
        </Link>
      </li>
    </ul>
  )
}
