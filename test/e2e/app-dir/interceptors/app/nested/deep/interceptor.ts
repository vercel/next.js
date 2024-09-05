// import { redirect } from 'next/navigation'
import { setTimeout } from 'timers/promises'
import { logWithTime } from '../../time-utils'

export default async function interceptDeeplyNested(
  request: Request
): Promise<void> {
  await logWithTime('DeeplyNestedInterceptor', () => setTimeout(500))
  // redirect('/')
}
