import Link from 'next/link'
import { listNotes } from '@/lib/notes'

export default function NotesPage() {
  return (
    <main>
      <h1 data-testid="notes-heading">All notes</h1>
      <ul>
        {listNotes().map((n) => (
          <li key={n.id}>
            <Link href={`/notes/${n.id}`} data-testid={`note-link-${n.id}`}>
              {n.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
