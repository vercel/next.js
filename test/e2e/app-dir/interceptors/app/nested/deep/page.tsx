import { setTimeout } from 'timers/promises'
import { createTimeStamp, logWithTime } from '../../time-utils'

export default async function DeeplyNestedPage() {
  await logWithTime('DeeplyNestedPage', () => setTimeout(500))

  return <p>deeply nested page {createTimeStamp()}</p>
}
