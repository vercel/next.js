'use client'

import { useState, useEffect } from 'react'

export default function FirstDynamic() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="first-dynamic">
      <h2>First Dynamic Component</h2>
      <p>This is the first dynamically imported component.</p>
      <p>Component mounted: {mounted ? 'Yes' : 'No'}</p>
      <div id="first-unique-content">First component specific content</div>
      <style jsx>{`
        .first-dynamic {
          background-color: #e3f2fd;
          padding: 20px;
          border-radius: 8px;
          margin: 10px 0;
        }
      `}</style>
    </div>
  )
}
