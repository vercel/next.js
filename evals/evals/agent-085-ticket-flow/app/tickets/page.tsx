import Link from 'next/link'
import { Suspense } from 'react'
import { fetchTickets } from '../../lib/tickets'

async function TicketList() {
  const { tickets, fetchedAt } = await fetchTickets()
  return (
    <>
      <p>Data refreshed {fetchedAt}</p>
      {tickets.length === 0 ? (
        <p data-testid="ticket-list-empty">No tickets yet.</p>
      ) : (
        <ul data-testid="ticket-list">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/tickets/${t.id}`}>#{t.id}</Link> {t.body}
            </li>
          ))}
        </ul>
      )}
    </>
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
