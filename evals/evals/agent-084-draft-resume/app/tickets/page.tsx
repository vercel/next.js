import Link from 'next/link'
import { Suspense } from 'react'
import { connection } from 'next/server'
import { getTickets } from '../../lib/tickets'

async function TicketList() {
  await connection()
  const tickets = getTickets()
  if (tickets.length === 0) {
    return <p data-testid="ticket-list-empty">No tickets yet.</p>
  }
  return (
    <ul data-testid="ticket-list">
      {tickets.map((t) => (
        <li key={t.id}>{t.body}</li>
      ))}
    </ul>
  )
}

export default function TicketsPage() {
  return (
    <main data-testid="tickets-page">
      <h1>Support tickets</h1>
      <Link data-testid="new-ticket-link" href="/tickets/new">
        New ticket
      </Link>
      <Suspense fallback={<p>Loading tickets…</p>}>
        <TicketList />
      </Suspense>
    </main>
  )
}
