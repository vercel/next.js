import Link from 'next/link'
import { Suspense } from 'react'
import { fetchTicket } from '../../../lib/tickets'

async function TicketDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ticket, fetchedAt } = await fetchTicket(Number(id))
  if (!ticket) {
    return <p>Ticket not found.</p>
  }
  return (
    <>
      <p>Data refreshed {fetchedAt}</p>
      <p data-testid="ticket-body">{ticket.body}</p>
    </>
  )
}

export default function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <main data-testid="ticket-detail-page">
      <h1>Ticket detail</h1>
      <Suspense fallback={<p>Loading ticket…</p>}>
        <TicketDetail params={params} />
      </Suspense>
      <p>
        <Link href="/tickets">Back to tickets</Link>
      </p>
    </main>
  )
}
