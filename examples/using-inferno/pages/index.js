import React from 'react'
import Link from 'next/link'

export default () => (
  <div>
    Hello World.{' '}
    <Link prefetch href='/about'>
      <a>About</a>
    </Link>
  </div>
)
