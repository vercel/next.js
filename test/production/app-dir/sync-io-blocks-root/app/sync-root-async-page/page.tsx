import { Suspense } from 'react'

export default async function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <SyncIO />
    </Suspense>
  )
}

async function SyncIO() {
  if (process.env.NEXT_TEST_SYNC_IO_TRACE) {
    process.stderr.write(
      `[sync-io-trace] route=/sync-root-async-page stage=before-date-now pid=${process.pid} ppid=${process.ppid} isNextWorker=${process.env.IS_NEXT_WORKER}\n`
    )
  }
  const now = Date.now()
  if (process.env.NEXT_TEST_SYNC_IO_TRACE) {
    process.stderr.write(
      `[sync-io-trace] route=/sync-root-async-page stage=after-date-now pid=${process.pid} ppid=${process.ppid} isNextWorker=${process.env.IS_NEXT_WORKER}\n`
    )
  }
  return <code>{now}</code>
}
