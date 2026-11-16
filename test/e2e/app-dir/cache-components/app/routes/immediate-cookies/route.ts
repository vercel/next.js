import { setImmediate } from 'node:timers/promises'
import { cookies } from 'next/headers'

import { getSentinelValue } from '../../getSentinelValue'

export async function GET() {
  await setImmediate()
  const cookieStore = await cookies()

  return Response.json({
    value: getSentinelValue(),
    cookie: cookieStore.get('test-immediate')?.value,
  })
}
