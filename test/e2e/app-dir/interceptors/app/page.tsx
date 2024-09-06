import { setTimeout } from 'timers/promises'
import { createTimeStamp, logWithTime } from './time-utils'

export default async function RootPage() {
  await logWithTime('RootPage', () => setTimeout(500))

  return <p suppressHydrationWarning>root page {createTimeStamp()}</p>
}
