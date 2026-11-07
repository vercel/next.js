export default function Page() {
  if (process.env.NEXT_TEST_SYNC_IO_TRACE) {
    process.stderr.write(
      `[sync-io-trace] route=/sync-root-sync-page-no-suspense stage=before-date-now pid=${process.pid} ppid=${process.ppid} isNextWorker=${process.env.IS_NEXT_WORKER}\n`
    )
  }
  const now = Date.now()
  if (process.env.NEXT_TEST_SYNC_IO_TRACE) {
    process.stderr.write(
      `[sync-io-trace] route=/sync-root-sync-page-no-suspense stage=after-date-now pid=${process.pid} ppid=${process.ppid} isNextWorker=${process.env.IS_NEXT_WORKER}\n`
    )
  }
  return <code>{now}</code>
}
