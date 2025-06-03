import * as React from 'react'

export default async function Page() {
  const messages = (await import('./async-messages')).default
  return (
    <main>
      <p>{messages.title}</p>
    </main>
  )
}
