import Link from 'next/link'

export default function InboxIndexPage() {
  return (
    <main>
      <h1>Inbox</h1>
      <ul>
        <li>
          <Link href="/inbox/thread-123">Visit inbox thread</Link>
        </li>
      </ul>
    </main>
  )
}
