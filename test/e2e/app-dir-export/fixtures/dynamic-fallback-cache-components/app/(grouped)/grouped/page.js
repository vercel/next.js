import Link from 'next/link'

export default function GroupedIndexPage() {
  return (
    <main>
      <h1>Grouped index</h1>
      <ul>
        <li>
          <Link href="/grouped/from-group">Visit grouped fallback page</Link>
        </li>
      </ul>
    </main>
  )
}
