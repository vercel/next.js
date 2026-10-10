'use client'
import { describeBlogVendor } from './vendor-blog'
import { useState } from 'react'
export default function NewsletterForm({ icon }) {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  return (
    <form
      className="newsletter"
      onSubmit={(e) => {
        e.preventDefault()
        setDone(true)
      }}
    >
      {icon}
      <input
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button type="submit">{done ? 'Subscribed ✓' : 'Subscribe'}</button>
    </form>
  )
}
export const __vendor = typeof describeBlogVendor
