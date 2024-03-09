import Link from 'next/link'
import { useRouter } from 'next/router'
import React from 'react'

const LongPageToSnapScroll = () => {
  const router = useRouter()
  return (
    <div id="long-page-to-snap-scroll">
      <Link href="#item-400" id="scroll-to-item-400">
        Go to item 400
      </Link>

      {Array.from({ length: 500 }, (x, i) => i + 1).map((i) => {
        return (
          <div key={`item-${i}`} id={`item-${i}`}>
            {i}
          </div>
        )
      })}

      <Link href="/snap-scroll-position" id="goto-snap-scroll-position">
        Go to snap scroll declarative
      </Link>
      <div
        id="goto-snap-scroll-position-imperative"
        onClick={(e) => {
          e.preventDefault()
          router.push('/snap-scroll-position')
        }}
      >
        Go to snap scroll imperative
      </div>
      <div
        id="goto-snap-scroll-position-imperative-noscroll"
        onClick={(e) => {
          e.preventDefault()
          router.push('/snap-scroll-position', '/snap-scroll-position', {
            scroll: false,
          })
        }}
      >
        Go to snap scroll imperative (no scroll)
      </div>
    </div>
  )
}

export default LongPageToSnapScroll
