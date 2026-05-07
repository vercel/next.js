import Link from 'next/link'

export default function OrgIndexPage() {
  return (
    <main>
      <h1>Org index</h1>
      <ul>
        <li>
          <Link href="/org/acme/chat/thread-123">
            Visit org chat thread 123
          </Link>
        </li>
      </ul>
    </main>
  )
}
