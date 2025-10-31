'use client'

const isClient = typeof window !== 'undefined'

export default function Mismatch() {
  return <div className="parent">{isClient && <main className="only" />}</div>
}
