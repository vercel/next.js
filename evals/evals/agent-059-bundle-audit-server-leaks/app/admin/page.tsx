import { listOpenTickets } from '@/lib/server/db'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const tickets = await listOpenTickets()

  return (
    <main>
      <h1>Open tickets</h1>
      <ul>
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            {ticket.id}: {ticket.subject}
          </li>
        ))}
      </ul>
    </main>
  )
}
