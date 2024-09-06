import { setTimeout } from 'timers/promises'
import { createTimeStamp, logWithTime } from '../time-utils'

export default async function NestedPage() {
  await logWithTime('NestedPage', () => setTimeout(500))

  return <p suppressHydrationWarning>nested page {createTimeStamp()}</p>
}
