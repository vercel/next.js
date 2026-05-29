import React from 'react'
import Link from 'next/link'

export default function Page1() {
  return (
    <div>
      <h1>Legacy Page 1</h1>
      <p>This page has smooth scroll without data attribute optimization.</p>
      <Link
        href="/page2"
        id="to-page2"
        style={{ display: 'block', marginBottom: '20px' }}
      >
        Go to Page 2
      </Link>
      <div style={{ height: '150vh', backgroundColor: '#f0f0f0' }}>
        <p>Scroll content...</p>
        <div style={{ height: '1000px' }} />
        <p>More content...</p>
      </div>
      <p>Bottom of page 1</p>
    </div>
  )
}
