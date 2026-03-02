'use client'

export function SyncIOClient() {
  const now = Date.now()
  return <p suppressHydrationWarning>Time: {now}</p>
}
