import React from 'react'
import Link from 'next/link'

const Page = () => {
  return (
    <div>
      Hi!
      <br />
      <br />
      <Link href="/with-font" id="with-font">
        With font
      </Link>
    </div>
  )
}

export default Page
