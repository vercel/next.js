import { randomUUID } from 'node:crypto'

export function RequestMetadata() {
  const generatedAt = new Date().toISOString()
  const sample = Math.random()
  const requestId = randomUUID()

  return (
    <aside>
      Request {requestId} generated at {generatedAt} (sample {sample})
    </aside>
  )
}
