'use client'

import { useEffect, useState } from 'react'

export default function Page() {
  const [messages, setMessages] = useState<string[]>([])

  useEffect(() => {
    Promise.all([
      import(/* turbopackChunkName: "my-widget" */ './widget'),
      import(/* webpackChunkName: "legacy-widget" */ './legacy-widget'),
      import(
        /* turbopackChunkName: "wins" */
        /* webpackChunkName: "loses" */
        './precedence-widget'
      ),
      import(/* turbopackChunkName: "lazy-[request]" */ './request-widget'),
      import(/* turbopackChunkName: "[request]" */ './pure-request-widget'),
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
