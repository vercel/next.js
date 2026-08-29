import Link from 'next/link'
import TicketForm from '../../../components/ticket-form'

export default function NewTicketPage() {
  return (
    <main data-testid="new-ticket-page">
      <h1>New ticket</h1>
      <TicketForm />
      <Link data-testid="back-to-tickets-link" href="/tickets">
        Back to tickets
      </Link>
    </main>
  )
}
