import React from 'react'
import Link from 'next/link'

export default () => (
  <ul>
    <li><Link href='/things?id=1' as='/things/1'><a>Thing 1</a></Link></li>
  </ul>
)
