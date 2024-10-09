import { NextRequest } from 'next/server'
import { logWithTime } from '../../time-utils'

export default async function interceptRoot(
  request: NextRequest
): Promise<void> {
  await logWithTime('ApiNestedInterceptor', async () => {
    if (request.method === 'POST') {
      console.log(
        'ApiNestedInterceptor',
        request.nextUrl.pathname,
        await request.json()
      )
    }
  })
}
