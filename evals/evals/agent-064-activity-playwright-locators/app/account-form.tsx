'use client'

import { useState } from 'react'

export function AccountForm({ section }: { section: string }) {
  const [email, setEmail] = useState('')

  return (
    <section>
      <h1>{section}</h1>
      <label>
        Email
        <input
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <p role="status" data-testid="account-status">
        {section} ready
      </p>
    </section>
  )
}
