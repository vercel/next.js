import React from 'react'
import Link from 'next/link'

export default function HomePage() {
  return (
    <div>
      <h1>Smooth Scroll Optimization Tests</h1>
      <div style={{ marginBottom: '20px' }}>
        <Link
          href="/optimized/page1"
          style={{ display: 'block', marginBottom: '10px' }}
        >
          Test Optimized Smooth Scroll (with data attribute)
        </Link>
        <Link href="/legacy/page1" style={{ display: 'block' }}>
          Test Legacy Smooth Scroll (no data attribute)
        </Link>
      </div>
    </div>
  )
}
