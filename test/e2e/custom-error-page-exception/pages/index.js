import React from 'react'
import Link from 'next/link'

function page() {
  return (
    <Link href="/" id="nav">
      Client side nav
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
