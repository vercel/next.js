import Link from 'next/link'
import React from 'react'

const LongPageToSnapScroll = () => {
  return (
    <div id="long-page-to-snap-scroll">
      <Link href="#item-400">
        <a id="scroll-to-item-400">Go to item 400</a>
      </Link>

      {Array.from({ length: 500 }, (x, i) => i + 1).map((i) => {
        return (
          <div key={`item-${i}`} id={`item-${i}`}>
            {i}
          </div>
        )
      })}

      <Link href="/snap-scroll-position">
        <a id="goto-snap-scroll-position">Go to snap scroll</a>
      </Link>
    </div>
  )
}

export default LongPageToSnapScroll
