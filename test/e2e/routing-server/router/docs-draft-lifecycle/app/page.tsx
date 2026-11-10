import { randomUUID } from 'node:crypto'
import { draftMode } from 'next/headers'

export default async function Page() {
  const { isEnabled } = await draftMode()
  return (
    <main>
      <p id="mode">{isEnabled ? 'draft' : 'public'}</p>
      <p id="value">{randomUUID()}</p>
    </main>
  )
}
