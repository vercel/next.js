'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const HashChanges = () => {
  const router = useRouter()

  return (
    <div id="hash-changes-page">
      <div>
        <Link href="#via-link" id="via-link">
          Via Link
        </Link>
      </div>
      <div>
        <a href="#via-a" id="via-a">
          Via A
        </a>
      </div>
      <div>
        <Link href="#" id="via-empty-hash">
          Via Empty Hash
        </Link>
      </div>

      <div>
        <Link href="#item-400" id="scroll-to-item-400">
          Go to item 400
        </Link>
      </div>

      <div>
        <Link href="#name-item-400" id="scroll-to-name-item-400">
          Go to name item 400
        </Link>
      </div>

      <div>
        <Link
          href="#name-item-400"
          scroll={false}
          id="scroll-to-name-item-400-no-scroll"
        >
          Go to name item 400 (no scroll)
        </Link>
      </div>

      <div>
        <Link href="#中文" id="scroll-to-cjk-anchor">
          Go to CJK anchor
        </Link>
      </div>

      <div>
        <Link href="#top" id="via-top-hash">
          Via Top Hash
        </Link>
      </div>
      <div id="asPath">ASPATH: {router.asPath}</div>
      <div id="pathname">PATHNAME: {router.pathname}</div>
      <div id="中文">CJK anchor</div>
      {Array.from({ length: 500 }, (x, i) => i + 1).map((i) => {
        return (
          <div key={`item-${i}`} name={`name-item-${i}`}>
            {i}
          </div>
        )
      })}
    </div>
  )
}

export default HashChanges
