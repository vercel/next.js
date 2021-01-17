import React from 'react'
import Link from 'next/link'

const HashChanges = () => {
  return (
    <div id="hash-changes-page">
      {Array.from({ length: 500 }, (x, i) => i + 1).map((i) => {
        return (
          <div key={`item-${i}`} id={`item-${i}`}>
            {i}
          </div>
        )
      })}
      <Link href="/hash-changes">
        <a id="to-hash-changes">Go to hash-changes page</a>
      </Link>
    </div>
  )
}

export default HashChanges
