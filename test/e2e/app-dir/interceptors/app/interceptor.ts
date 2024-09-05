import { setTimeout } from 'timers/promises'
import { logWithTime } from './time-utils'

export default async function interceptRoot(request: Request): Promise<void> {
  await logWithTime('RootInterceptor', () => setTimeout(1000))
}
