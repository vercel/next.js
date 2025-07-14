import React from 'react'
import Link from 'next/link'

export default function Page2() {
  return (
    <div>
      <h1>Optimized Page 2</h1>
      <p>This is the second page with smooth scroll optimization.</p>
      <Link
        href="/page1"
        id="to-page1"
        style={{ display: 'block', marginBottom: '20px' }}
      >
        Go to Page 1
      </Link>
      <div style={{ height: '150vh', backgroundColor: '#e0e0e0' }}>
        <p>Scroll content...</p>
        <div style={{ height: '1000px' }} />
        <p>More content...</p>
      </div>
      <p>Bottom of page 2</p>
    </div>
  )
}
