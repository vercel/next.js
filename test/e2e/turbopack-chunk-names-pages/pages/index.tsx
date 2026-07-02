import { useEffect, useState } from 'react'

export default function Page() {
  const [messages, setMessages] = useState<string[]>([])

  useEffect(() => {
    Promise.all([
      import(/* turbopackChunkName: "pages-widget" */ '../lib/widget'),
      import(
        /* webpackChunkName: "pages-legacy-widget" */ '../lib/legacy-widget'
      ),
    ]).then((modules) => setMessages(modules.map((mod) => mod.default)))
  }, [])

  return (
    <main>
      <p>hello world</p>
      <ul id="widgets">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </main>
  )
}
