import React from 'react'
import Image from 'next/image'
import Link from 'next/link'

const Page = () => {
  return (
    <div>
      <p>Image SSR Test</p>
      <Image
        id="basic-image"
        src="foo.jpg"
        loading="eager"
        width={300}
        height={400}
        quality={60}
      />
      <Image
        id="unoptimized-image"
        unoptimized
        src="https://arbitraryurl.com/foo.jpg"
        loading="eager"
        width={300}
        height={400}
      />
      <Link href="/client-side">
        <a id="clientlink">Client Side</a>
      </Link>
    </div>
  )
}

export default Page
