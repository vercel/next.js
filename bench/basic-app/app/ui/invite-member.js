'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function InviteMember({ icon }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  return open ? (
    <form
      className="invite-form"
      onSubmit={(e) => {
        e.preventDefault()
        setOpen(false)
      }}
    >
      <input
        type="email"
        placeholder="teammate@acme.dev"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button type="submit">Send</button>
    </form>
  ) : (
    <button
      type="button"
      className="invite-button text-xs"
      onClick={() => setOpen(true)}
    >
      {icon} Invite
    </button>
  )
}
export const __vendor = typeof describeBulkGraph
