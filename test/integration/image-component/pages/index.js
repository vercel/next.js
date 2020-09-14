import React from 'react'
import Image from 'next/image'
import Link from 'next/link'

const Page = () => {
  return (
    <div>
      <p>Hello World</p>
      <Image src="foo.jpg" />
      <Link href="/client-side">
        <a id="clientlink">Client Side</a>
      </Link>
      <p id="stubtext">This is the index page</p>
    </div>
  )
}

export default Page
