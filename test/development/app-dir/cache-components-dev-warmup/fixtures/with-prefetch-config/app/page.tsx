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
          <Link href="/short-stale-cache">/short-stale-cache</Link>
        </li>
        <li>
          <Link href="/successive-caches">/successive-caches</Link>
        </li>
        <li>
          <Link href="/apis/123">/apis/123</Link>
        </li>
        <li>
          <Link href="/mixed/en/123">/mixed/en/123</Link>
        </li>
        <li>
          <Link href="/mixed/fr/123">/mixed/fr/123</Link>
        </li>
        <li>
          <Link href="/mixed/en/x">/mixed/en/x</Link>
        </li>
        <li>
          <Link href="/sync-io/static">/sync-io/static</Link>
        </li>
        <li>
          <Link href="/sync-io/runtime">/sync-io/runtime</Link>
        </li>
      </ul>
    </main>
  )
}
