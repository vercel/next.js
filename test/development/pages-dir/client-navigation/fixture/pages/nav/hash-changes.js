import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

let count = 0

const HashChanges = ({ count }) => {
  const router = useRouter()

  return (
    <div id="hash-changes-page">
      <Link href="#via-link" id="via-link">
        Via Link
      </Link>
      <a href="#via-a" id="via-a">
        Via A
      </a>
      <Link href="/nav/hash-changes" id="page-url">
        Page URL
      </Link>
      <Link href="#" id="via-empty-hash">
        Via Empty Hash
      </Link>
      <Link href="#item-400" id="scroll-to-item-400">
        Go to item 400
      </Link>
      <Link href="#name-item-400" id="scroll-to-name-item-400">
        Go to name item 400
      </Link>
      <Link
        href="#name-item-400"
        scroll={false}
        id="scroll-to-name-item-400-no-scroll"
      >
        Go to name item 400 (no scroll)
      </Link>
      <Link href="#中文" id="scroll-to-cjk-anchor">
        Go to CJK anchor
      </Link>
      <p>COUNT: {count}</p>
      {Array.from({ length: 500 }, (x, i) => i + 1).map((i) => {
        return (
          <div key={`item-${i}`} id={`item-${i}`}>
            {i}
          </div>
        )
      })}
      {Array.from({ length: 500 }, (x, i) => i + 1).map((i) => {
        return (
          <div key={`item-${i}`} name={`name-item-${i}`}>
            {i}
          </div>
        )
      })}
      <Link href="#top" id="via-top-hash">
        Via Top Hash
      </Link>
      <div id="asPath">ASPATH: {router.asPath}</div>
      <div id="pathname">PATHNAME: {router.pathname}</div>
      <div id="中文">CJK anchor</div>
    </div>
  )
}

HashChanges.getInitialProps = ({ res }) => {
  if (res) return { count: 0 }
  count += 1

  return { count }
}

export default HashChanges
