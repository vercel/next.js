import { setTimeout } from 'timers/promises'
import { logWithTime } from '../time-utils'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

export default async function interceptNested(
  request: NextRequest
): Promise<void> {
  await logWithTime('NestedInterceptor', () => setTimeout(500))

  if (request.nextUrl.searchParams.has('redirect')) {
    redirect('/')
  }
}
