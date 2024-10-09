import { createTimeStamp, logWithTime, setTimeout } from './time-utils'

export default async function RootPage() {
  await logWithTime('RootPage', () => setTimeout(500))

  return <p suppressHydrationWarning>root page {createTimeStamp()}</p>
}
