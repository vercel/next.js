// a page not using i18next - no hoc - not t function
import React from 'react'
import Link from 'next/link'

export default () => {
  return (
    <div>
      <h1>Hello Page 3</h1>
      <Link href='/'>
        <a>back</a>
      </Link>
    </div>
  )
}
