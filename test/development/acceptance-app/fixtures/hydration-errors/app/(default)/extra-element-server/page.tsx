'use client'

const isServer = typeof window === 'undefined'

export default function Mismatch() {
  return <div className="parent">{isServer && <main className="only" />}</div>
}
