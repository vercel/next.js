import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <SyncIO />
    </Suspense>
  )
}

function SyncIO() {
  if (process.env.NEXT_TEST_SYNC_IO_TRACE) {
    process.stderr.write(
      `[sync-io-trace] route=/async-root-sync-page stage=before-date-now pid=${process.pid} ppid=${process.ppid} isNextWorker=${process.env.IS_NEXT_WORKER}\n`
    )
  }
  const now = Date.now()
  if (process.env.NEXT_TEST_SYNC_IO_TRACE) {
    process.stderr.write(
      `[sync-io-trace] route=/async-root-sync-page stage=after-date-now pid=${process.pid} ppid=${process.ppid} isNextWorker=${process.env.IS_NEXT_WORKER}\n`
    )
  }
  return <code>{now}</code>
}
