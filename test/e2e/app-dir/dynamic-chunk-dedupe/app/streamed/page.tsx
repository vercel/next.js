import { Suspense } from 'react'
import { connection } from 'next/server'
import { StreamedClient } from './streamed-client'

// Resolves after the shell has been sent, so its `next/dynamic` chunk is
// announced by `<link rel=preload>` tags streamed into `<body>`.
async function Late() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return <StreamedClient />
}

export default function Page() {
  return (
    <main>
      <p id="shell">shell</p>
      <Suspense fallback={<p id="streamed-loading">loading</p>}>
        <Late />
      </Suspense>
    </main>
  )
}
