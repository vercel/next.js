import * as React from 'react'

const modulePromise = import('./async-messages')

export default async function Page() {
  const messages = (await modulePromise).default
  return (
    <main>
      <p>{messages.title}</p>
    </main>
  )
}
