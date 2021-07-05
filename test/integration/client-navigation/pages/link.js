import React from 'react'
import Link from 'next/link'

const LinkComponent = () => (
  <div>
    Hello World.{' '}
    <Link href="/about">
      <a>About</a>
    </Link>
  </div>
)

export default LinkComponent
