import { randomUUID } from 'node:crypto'

export default async function Page() {
  'use cache'

  return (
    <main>
      <h1>Static page</h1>
      <p id="generation">{randomUUID()}</p>
    </main>
  )
}
