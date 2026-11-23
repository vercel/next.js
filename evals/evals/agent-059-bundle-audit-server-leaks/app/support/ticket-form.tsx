'use client'

import { useState } from 'react'
import { ticketSchema, type TicketField } from '@/lib/server/prompts'
import { getTicketHint } from './actions'

const fields = Object.keys(ticketSchema.properties) as TicketField[]

export function TicketForm() {
  const [hint, setHint] = useState('')
  const [values, setValues] = useState<Record<TicketField, string>>({
    subject: '',
    details: '',
  })
  const missing = ticketSchema.required.filter((field) => !values[field])

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      {fields.map((field) => (
        <label key={field}>
          {ticketSchema.properties[field].title}
          <input
            value={values[field]}
            onChange={(event) =>
              setValues({ ...values, [field]: event.target.value })
            }
          />
        </label>
      ))}
      <button type="submit" disabled={missing.length > 0}>
        Submit
      </button>
      <button
        type="button"
        onClick={async () => setHint(await getTicketHint())}
      >
        Get triage hint
      </button>
      <p>{hint}</p>
    </form>
  )
}
