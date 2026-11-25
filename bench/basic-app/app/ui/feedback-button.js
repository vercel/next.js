'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  return open ? (
    <form
      className="feedback-form"
      onSubmit={(e) => {
        e.preventDefault()
        setOpen(false)
      }}
    >
      <textarea
        placeholder="Share feedback…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit">Send</button>
    </form>
  ) : (
    <button
      type="button"
      className="feedback-trigger text-xs"
      onClick={() => setOpen(true)}
    >
      Feedback
    </button>
  )
}
export const __vendor = typeof describeBulkGraph
