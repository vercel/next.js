'use client'

import { useState, useEffect } from 'react'

export default function SecondDynamic() {
  const [mounted, setMounted] = useState(false)
  const [data, setData] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
    setTimeout(() => {
      setData('Second component data loaded')
    }, 100)
  }, [])

  return (
    <div className="second-dynamic">
      <h2>Second Dynamic Component</h2>
      <p>This is the second dynamically imported component.</p>
      <p>Component mounted: {mounted ? 'Yes' : 'No'}</p>
      <p>Data: {data || 'Loading...'}</p>
      <div id="second-unique-content">Second component specific content</div>
      <style jsx>{`
        .second-dynamic {
          background-color: #f3e5f5;
          padding: 20px;
          border-radius: 8px;
          margin: 10px 0;
        }
      `}</style>
    </div>
  )
}
