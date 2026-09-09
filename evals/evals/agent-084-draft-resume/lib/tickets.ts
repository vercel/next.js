export interface Ticket {
  id: number
  body: string
  createdAt: number
}

// In-memory store; resets when the server restarts, which is fine for this
// internal tool.
const tickets: Ticket[] = []

export function addTicket(body: string): Ticket {
  const ticket: Ticket = {
    id: tickets.length + 1,
    body,
    createdAt: Date.now(),
  }
  tickets.push(ticket)
  return ticket
}

export function getTickets(): Ticket[] {
  return tickets.slice().reverse()
}
