import { setTimeout } from 'timers/promises'
import { logWithTime } from '../time-utils'
// import { redirect } from 'next/navigation'

export default async function interceptNested(request: Request): Promise<void> {
  await logWithTime('NestedInterceptor', () => setTimeout(500))
  // TODO: redirect if search params say so
  // redirect('/')
}
