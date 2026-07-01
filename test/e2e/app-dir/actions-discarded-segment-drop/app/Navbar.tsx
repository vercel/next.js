'use client'

import Link from 'next/link'

// A persistent bar of prefetched <Link>s rendered on every page (including the
// schedule page), mirroring the reported app's nav menu. The prefetched "/staff"
// link is part of the conditions under which the soft-nav segment drop appears.
export function Navbar() {
  return (
    <nav
      data-testid="navbar"
      style={{
        display: 'flex',
        gap: 12,
        padding: 8,
        borderBottom: '1px solid #ccc',
      }}
    >
      <Link href="/dashboard" data-testid="nav-dashboard">
        Dashboard
      </Link>
      <Link href="/staff" data-testid="nav-staff">
        Staff
      </Link>
      <Link href="/" data-testid="nav-home">
        Home
      </Link>
    </nav>
  )
}
