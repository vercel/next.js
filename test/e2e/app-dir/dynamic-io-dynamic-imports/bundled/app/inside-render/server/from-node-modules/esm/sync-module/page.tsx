import * as React from 'react'
import { getMessages } from 'esm-pkg-with-async-import'

export default async function Page() {
  const messages = await getMessages()
  return (
    <main>
      <p>{messages.title}</p>
    </main>
  )
}
