import { randomUUID } from 'node:crypto'

export const dynamic = 'force-dynamic'

export default function PhotoPage() {
  return (
    <main>
      <h1 id="background-title">Photo PAGE</h1>
      <p id="background-render">{randomUUID()}</p>
    </main>
  )
}
