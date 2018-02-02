import React from 'react'
import Link from 'next/link'

const OtherPage = () => (
  <div>
    <h1>Other Page</h1>
    <Link href='/'>
      <a>Get back to "/"</a>
    </Link>
  </div>
)

export default OtherPage
