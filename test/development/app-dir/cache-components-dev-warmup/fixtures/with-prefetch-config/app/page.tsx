import Link from 'next/link'

export default function Page() {
  // NOTE: these links must be kept in sync with `path` variables used in the test
  return (
    <main>
      <ul>
        <li>
          <Link href="/simple">/simple</Link>
        </li>
        <li>
          <Link href="/private-cache">/private-cache</Link>
        </li>
        <li>
          <Link href="/short-lived-cache">/short-lived-cache</Link>
        </li>
        <li>
          <Link href="/successive-caches">/successive-caches</Link>
        </li>
        <li>
          <Link href="/apis/123">/apis/123</Link>
        </li>
      </ul>
    </main>
  )
}
