'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { fast, slow, slowReject, slowRevalidate } from './actions'

export function Start({ kind }: { kind?: 'reject' | 'revalidate' }) {
  // The slow action is still in flight when a navigation discards it.
  useEffect(() => {
    fast().catch(() => {})
    if (kind === 'reject') {
      slowReject(1500).catch(() => {})
    } else if (kind === 'revalidate') {
      slowRevalidate(1500).catch(() => {})
    } else {
      slow(1500).catch(() => {})
    }
  }, [kind])
  return (
    <div data-testid="start">
      <Link href="/mid" data-testid="to-mid">
        mid
      </Link>
    </div>
  )
}

export function Mid() {
  // Delay the link so the next navigation happens while the slow action —
  // which the queue starts once the navigation to /mid settles — is still in
  // flight. Deliberately not a Server Action: that would queue behind the slow
  // action and not appear until it already settled.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 200)
    return () => clearTimeout(t)
  }, [])
  if (!ready) return <div data-testid="mid-loading">loading…</div>
  return (
    <div data-testid="mid">
      <Link href="/mid/leaf" data-testid="to-leaf">
        leaf
      </Link>
    </div>
  )
}

export function Leaf() {
  // These queue up behind the discarded action; when the bug is present, their
  // responses are computed against /mid and revert the navigation.
  useEffect(() => {
    slow(50).catch(() => {})
    slow(50).catch(() => {})
  }, [])
  return <div data-testid="leaf">leaf content</div>
}
