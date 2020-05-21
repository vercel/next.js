import React from 'react'
import Link from 'next/link'

const GNB = () => {
  return (
    <>
      <style jsx={true}>{`
        ul {
          display: flex;
        }
        li {
          display: flex;
          margin-left: 20px;
        }
      `}</style>
      <ul>
        <li>
          <Link href="/">
            <a>HOME</a>
          </Link>
        </li>
        <li>
          <Link href="/about">
            <a>ABOUT</a>
          </Link>
        </li>
        <li>
          <Link href="/example">
            <a>EXAMPLE</a>
          </Link>
        </li>
      </ul>
    </>
  )
}

export default GNB
