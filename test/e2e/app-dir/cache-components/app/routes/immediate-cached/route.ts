import { setImmediate, setTimeout } from 'node:timers/promises'

import { getSentinelValue } from '../../getSentinelValue'

async function getCachedMessage(message: string) {
  'use cache'
  await setTimeout(20)
  return message
}

export async function GET() {
  const first = await getCachedMessage('first')

  for (let i = 0; i < 5; i++) {
    await setImmediate()
  }

  const second = await getCachedMessage('second')

  return Response.json({ value: getSentinelValue(), first, second })
}
