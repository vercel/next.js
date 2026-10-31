'use client'

export function SyncIO() {
  queueMicrotask(() => {
    new Date().toISOString()
  })

  return (
    <main>
      <h1>Sync IO Access</h1>
      <p>Current date and time is read in a microtask.</p>
    </main>
  )
}
