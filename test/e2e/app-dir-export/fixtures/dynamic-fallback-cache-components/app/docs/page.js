import Link from 'next/link'

export default function DocsIndex() {
  return (
    <main>
      <h1>Docs</h1>
      <ul>
        <li>
          <Link href="/docs/reference/export">docs reference page</Link>
        </li>
        <li>
          <Link href="/docs/guides/export/fallback">
            docs export fallback page
          </Link>
        </li>
      </ul>
    </main>
  )
}
