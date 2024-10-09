import { NextRequest } from 'next/server'
import { logWithTime, setTimeout } from '../time-utils'

export default async function interceptRoot(
  request: NextRequest
): Promise<void> {
  await logWithTime('ActionInterceptor', () => setTimeout(250))
}
