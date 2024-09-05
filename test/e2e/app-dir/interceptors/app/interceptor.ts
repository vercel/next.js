import { setTimeout } from 'timers/promises'
import { logWithTime } from './time-utils'
import { NextRequest } from 'next/server'

export default async function interceptRoot(
  request: NextRequest
): Promise<void> {
  await logWithTime('RootInterceptor', () => {
    console.log('URL:', request.url)
    return setTimeout(1000)
  })
}
