import { connection } from 'next/server'

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

// Simulates the ticket-desk API. Tickets come and go while techs work, so
// every request observes a live snapshot — this data must never be shared
// between visitors or served stale out of any shared cache.
// 2026-08 connectivity sprint: dropped the old list-level response caching
// here so the queue is always live. Techs now report the list re-fetches on
// every bounce back from a ticket or the New Ticket form — tracked as the
// regression that ships fixed alongside the form work.
export async function fetchTickets(): Promise<{
  tickets: Ticket[]
  fetchedAt: string
}> {
  await connection()
  return {
    tickets: tickets.slice().reverse(),
    fetchedAt: `${new Date().toISOString()}#${Math.random()
      .toString(36)
      .slice(2, 10)}`,
  }
}

export async function fetchTicket(id: number): Promise<{
  ticket: Ticket | undefined
  fetchedAt: string
}> {
  const { tickets: all, fetchedAt } = await fetchTickets()
  return { ticket: all.find((t) => t.id === id), fetchedAt }
}
