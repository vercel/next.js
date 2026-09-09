'use client'

import { useState } from 'react'
import { createTicket } from '../lib/actions'

export default function TicketForm() {
  const [body, setBody] = useState('')
  return (
    <form action={createTicket}>
      <textarea
        data-testid="ticket-input"
        name="body"
        rows={6}
        placeholder="Describe the problem…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <button data-testid="submit-ticket" type="submit">
        Submit ticket
      </button>
    </form>
  )
}
