'use client'

export function SyncIO() {
  // This is a sync IO access that should not cause an error
  const data = new Date().toISOString()

  return (
    <main>
      <h1>Sync IO Access</h1>
      <p suppressHydrationWarning>Current date and time: {data}</p>
    </main>
  )
}
