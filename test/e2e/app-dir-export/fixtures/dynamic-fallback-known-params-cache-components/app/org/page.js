import Link from 'next/link'

export default function OrgIndexPage() {
  return (
    <main>
      <h1>Org index</h1>
      <ul>
        <li>
          <Link href="/org/acme/chat/thread-123">
            Visit known org chat thread
          </Link>
        </li>
        <li>
          <Link href="/org/acme/chat/thread-789">
            Visit fallback org chat thread
          </Link>
        </li>
      </ul>
    </main>
  )
}
