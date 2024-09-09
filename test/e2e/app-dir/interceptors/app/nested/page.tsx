import { setTimeout } from 'timers/promises'
import { createTimeStamp, logWithTime } from '../time-utils'
import { getData } from './data'

export default async function NestedPage() {
  await logWithTime('NestedPage', () => setTimeout(500))
  const data = await getData()

  return (
    <>
      <p suppressHydrationWarning>nested page {createTimeStamp()}</p>
      <p data-testid="data">{data}</p>
    </>
  )
}
