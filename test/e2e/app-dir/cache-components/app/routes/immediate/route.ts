import { setImmediate } from 'node:timers/promises'

import { getSentinelValue } from '../../getSentinelValue'

export async function GET() {
  await setImmediate()

  return Response.json({
    value: getSentinelValue(),
    message: 'immediate',
  })
}
