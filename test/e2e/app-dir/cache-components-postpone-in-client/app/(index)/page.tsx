import Link from 'next/link'

export default async function Page() {
  return (
    <main>
      <h2>Suspense above body</h2>
      <ul>
        <li>
          <Link href="/suspense-above-body/use-params/123">
            /suspense-above-body/use-params/123
          </Link>
        </li>
        <li>
          <Link href="/suspense-above-body/use-search-params">
            /suspense-above-body/use-search-params
          </Link>
        </li>
      </ul>

      <h2>Suspense inside body</h2>
      <ul>
        <li>
          <Link href="/suspense-inside-body/use-params/123">
            /suspense-inside-body/use-params/123
          </Link>
        </li>
        <li>
          <Link href="/suspense-inside-body/use-search-params">
            /suspense-inside-body/use-search-params
          </Link>
        </li>
      </ul>

      <h2>instant = false</h2>
      <ul>
        <li>
          <Link href="/instant-false/use-params/123">
            /instant-false/use-params/123
          </Link>
        </li>
        <li>
          <Link href="/instant-false/use-search-params">
            /instant-false/use-search-params
          </Link>
        </li>
      </ul>
    </main>
  )
}
