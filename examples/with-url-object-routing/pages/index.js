import React from 'react'
import Link from 'next/link'

const href = {
  pathname: '/about',
  query: { name: 'next' },
}

const as = {
  pathname: '/about/next',
  hash: 'title-1',
}

export default () => (
  <div>
    <h1>Home page</h1>
    <Link href={href} as={as}>
      <a>Go to /about/next</a>
    </Link>
  </div>
)
