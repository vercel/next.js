'use client'

export function SyncIOInClient({ children }) {
  const now = Date.now()
  return (
    <>
      <div>
        Hello, browser! Now: "<span suppressHydrationWarning>{now}</span>"
      </div>
      <hr />
      {children}
    </>
  )
}
