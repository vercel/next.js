'use client'

import { useState } from 'react'
import { createConversation, type ChatMessage } from '@/lib/chat/messages'

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(createConversation)
  const [draft, setDraft] = useState('')
  const [refundPrompt, setRefundPrompt] = useState('')

  async function send() {
    const next = [...messages, { role: 'user' as const, content: draft }]
    setMessages(next)
    setDraft('')
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: next }),
    })
    const reply: ChatMessage = await response.json()
    setMessages([...next, reply])
  }

  async function requestRefund() {
    const { createRefundPrompt } = await import('@/lib/chat/refunds')
    setRefundPrompt(createRefundPrompt(draft))
  }

  return (
    <section aria-label="Support chat">
      <ul>
        {messages
          .filter((message) => message.role !== 'system')
          .map((message, index) => (
            <li key={index}>{message.content}</li>
          ))}
      </ul>
      <input value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button type="button" onClick={send}>
        Send
      </button>
      <button type="button" onClick={requestRefund}>
        Draft a refund request
      </button>
      <label>
        Edit your refund drafting prompt
        <textarea
          value={refundPrompt}
          onChange={(event) => setRefundPrompt(event.target.value)}
        />
      </label>
    </section>
  )
}
