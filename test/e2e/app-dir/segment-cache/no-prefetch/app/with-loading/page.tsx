import { connection } from 'next/server'
import { SuspendForeverOnClient } from './client'

export default async function Page() {
  await connection()
  return (
    <main>
      {/* Block on the client to make sure that the loading boundary works correctly. */}
      <SuspendForeverOnClient />
    </main>
  )
}
