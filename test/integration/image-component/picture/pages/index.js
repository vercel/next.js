import React from 'react'
import Image from 'next/image'
import Link from 'next/link'

const Page = () => {
  return (
    <div>
      <p id="ssr">Image SSR Test</p>
      <div id="basic-image-wrapper">
        <Image
          id="basic-image"
          src="/foo.jpg"
          loading="eager"
          width={300}
          height={400}
          quality={60}
        />
      </div>
      <div id="unoptimized-image-wrapper">
        <Image
          unoptimized
          src="https://arbitraryurl.com/foo.jpg"
          loading="eager"
          width={300}
          height={400}
        />
      </div>
      <Link href="/client-side">
        <a id="clientlink">Client Side</a>
      </Link>
    </div>
  )
}

export default Page
