import { setTimeout } from 'timers/promises'
import { createTimeStamp, logWithTime } from '../../time-utils'

export default async function DeeplyNestedPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await logWithTime('DeeplyNestedPage', () => setTimeout(500))
  const { slug } = await params

  return (
    <>
      <h3>{slug}</h3>
      <p suppressHydrationWarning>deeply nested page {createTimeStamp()}</p>
    </>
  )
}
