import { Toolbar } from './toolbar'

const messages = [
  { id: 'm1', subject: 'Welcome aboard' },
  { id: 'm2', subject: 'Your invoice for July' },
  { id: 'm3', subject: 'Weekly digest' },
]

export default function InboxPage() {
  return (
    <main>
      <h1>Inbox</h1>
      <Toolbar ids={messages.map((m) => m.id)} />
      <ul>
        {messages.map((m) => (
          <li key={m.id}>{m.subject}</li>
        ))}
      </ul>
    </main>
  )
}
