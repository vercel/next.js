import { createTimeStamp, logWithTime, setTimeout } from './time-utils'
import { NextRequest, unstable_after as after } from 'next/server'

export default async function interceptRoot(
  request: NextRequest
): Promise<void> {
  await logWithTime('RootInterceptor', () => {
    console.log('URL:', request.url)
    return setTimeout(1000)
  })

  after(() => {
    console.log(createTimeStamp(), 'After')
  })
}
