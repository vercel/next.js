'use client'

// This page has two hydrations issues:
// - bad nested tags
// - server client mismatch
export default function Page() {
  const clx = typeof window === 'undefined' ? 'server' : 'client'
  return (
    <p className={clx}>
      <p>nest</p>
    </p>
  )
}
