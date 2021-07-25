import React from 'react'
import Link from 'next/link'

const Page = () => {
  return (
    <div>
      Hi!
      <br />
      <br />
      <Link href="/with-font">
        <a id="with-font">With font</a>
      </Link>
    </div>
  )
}

export default Page
