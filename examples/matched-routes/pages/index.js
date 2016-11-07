import React from 'react'
import Link from 'next/link'

export default () => (
  <div>
    <h1>A list of Users</h1>
    <p><em>All using the same react page template...</em></p>
    <ul>
      <li><Link href='/user/1'>User 1</Link></li>
      <li><Link href='/user/2'>User 2</Link></li>
      <li><Link href='/user/3'>User 3</Link></li>
    </ul>
  </div>
)
