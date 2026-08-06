'use client'

const isClient = typeof window !== 'undefined'

export default function Mismatch() {
  return (
    <div className="parent">
      <main className="child">{isClient ? 'client' : 'server'}</main>
    </div>
  )
}
