import React from 'react'
import Image from 'next/image'
import Link from 'next/link'

const Page = () => {
  return (
    <div>
      <p>Hello World</p>
      <Image id="basic-image" src="foo.jpg"></Image>
      <Image id="attribute-test" data-demo="demo-value" src="bar.jpg" />
      <Image
        id="secondary-image"
        data-demo="demo-value"
        host="secondary"
        src="foo2.jpg"
      />
      <Image
        id="unoptimized-image"
        unoptimized
        src="https://arbitraryurl.com/foo.jpg"
      />
      <Link href="/client-side">
        <a id="clientlink">Client Side</a>
      </Link>
      <p id="stubtext">This is the index page</p>
    </div>
  )
}

export default Page
