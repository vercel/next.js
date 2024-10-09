import { logWithTime, setTimeout } from '../../time-utils'
import { NextRequest } from 'next/server'

export default async function interceptDeeplyNested(
  request: NextRequest
): Promise<void> {
  await logWithTime('DeeplyNestedInterceptor', () => setTimeout(500))
}
