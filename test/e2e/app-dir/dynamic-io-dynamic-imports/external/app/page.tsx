import * as React from 'react'
// NOTE: this is not actually external by default, only in one test where we patch `next.config.js`
import { getMessagesAsync } from 'external-esm-pkg-with-async-import'

export default async function Page() {
  const messages = await getMessagesAsync()
  return (
    <main>
      <p>{messages.title}</p>
    </main>
  )
}
