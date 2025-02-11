'use client'

// This page has two hydrations issues:
// - bad nested tags
// - server client mismatch
export default function Page() {
  return (
    <p className={Date.now() + ''}>
      <p>nest</p>
    </p>
  )
}
