import Link from 'next/link'

export default function Page() {
  // NOTE: these links must be kept in sync with `path` variables used in the test
  return (
    <main>
      <ul>
        <li>
          <Link href="/simple">/simple</Link>
        </li>
      </ul>
    </main>
  )
}
