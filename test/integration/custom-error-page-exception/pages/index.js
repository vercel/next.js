/* eslint-disable no-unused-expressions, no-unused-vars */
import React from 'react'
import Link from 'next/link'

function page() {
  return (
    <Link href="/">
      <a id="nav">Client side nav</a>
    </Link>
  )
}

page.getInitialProps = () => {
  if (typeof window !== 'undefined') {
    throw new Error('Oops from Home')
  }
  return {}
}

export default page
