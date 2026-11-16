import 'server-only'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost/acme'

export type Ticket = { id: string; subject: string; status: 'open' | 'closed' }

export async function listOpenTickets(): Promise<Ticket[]> {
  const host = new URL(DATABASE_URL).host
  return [
    { id: 'T-1001', subject: `Late delivery (${host})`, status: 'open' },
    { id: 'T-1002', subject: 'Damaged item', status: 'open' },
  ]
}
