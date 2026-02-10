import Link from 'next/link'

export default function IndexPage() {
  return (
    <main>
      <h1>Instant Validation Test</h1>
      <ul>
        <li>
          <Link href="/default">Default (plain root layout)</Link>
        </li>
        <li>
          <Link href="/suspense-in-root">Suspense in Root</Link>
        </li>
      </ul>
    </main>
  )
}
