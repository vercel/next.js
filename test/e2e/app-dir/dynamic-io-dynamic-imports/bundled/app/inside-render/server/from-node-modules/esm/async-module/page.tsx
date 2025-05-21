import * as React from 'react'
import { getMessagesAsync } from 'esm-pkg-with-async-import'

export default async function Page() {
  const messages = await getMessagesAsync()
  return (
    <main>
      <p>{messages.title}</p>
    </main>
  )
}
