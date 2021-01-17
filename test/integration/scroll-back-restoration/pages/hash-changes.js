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
      <Link href="#item-100">
        <a id="scroll-to-item-100">Go to item 100</a>
      </Link>
    </div>
  )
}

export default HashChanges
