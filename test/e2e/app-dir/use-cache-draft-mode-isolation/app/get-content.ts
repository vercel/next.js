import { draftMode } from 'next/headers'
import { setTimeout } from 'timers/promises'

export async function getContent(key) {
  'use cache'

  const { isEnabled } = await draftMode()

  // Simulate I/O latency so that a concurrent request overlaps the pending
  // fill.
  await setTimeout(3000)

  return isEnabled ? 'DRAFT-SECRET' : 'PUBLIC'
}
