import Link from 'next/link'
import { getSessions } from '@/lib/sessions'

export default async function SessionsPage() {
  const sessions = await getSessions()

  return (
    <main>
      <h1>Conference sessions</h1>
      <ul>
        {sessions.map((session, index) => (
          <li key={session.slug}>
            <Link
              href={`/sessions/${session.slug}`}
              data-testid={index === 0 ? 'featured-session' : undefined}
            >
              {session.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
